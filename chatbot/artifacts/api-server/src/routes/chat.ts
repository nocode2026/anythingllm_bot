import { Router } from 'express';
import { z } from 'zod';
import { classifyQuery } from '../lib/queryRouter';
import { retrieveChunks } from '../lib/retrieval';
import { generateAnswer, getEmbedding } from '../lib/answerPipeline';
import {
  getOrCreateSession, updateSession, saveMessage,
  getSessionMessages, resetSession,
  canInheritContext, canInheritContextCautious,
} from '../lib/sessionManager';
import { moderateInput, moderateOutput, getModerationResponse } from '../lib/moderationGuard';
import { logEvent } from '../lib/analytics';
import { buildSuggestedQuestions } from '../lib/suggestedQuestions';

export const chatRouter = Router();

function stripSuggestedSection(answerText: string): string {
  // Remove model-generated "Mozesz tez zapytac" section to avoid duplicate numbered lists.
  return answerText
    .replace(/\n\s*(Możesz też zapytać|Mozesz tez zapytac)\s*:\s*[\s\S]*$/i, '')
    .trim();
}

const MessageBodySchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional(),
  faculty_override: z.string().optional(),
});

// POST /api/chat/message
chatRouter.post('/message', async (req, res) => {
  const startTime = Date.now();

  const parsed = MessageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { message, session_id, faculty_override } = parsed.data;

  // ── 1. Moderation: input ──
  const inputMod = moderateInput(message);
  if (inputMod.blocked) {
    return res.status(200).json({
      session_id: session_id ?? null,
      answer: getModerationResponse(inputMod.reason!),
      response_type: inputMod.reason === 'out_of_scope' ? 'refusal' : 'refusal',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: null,
      suggested_questions: [],
    });
  }

  // ── 2. Session ──
  const session = await getOrCreateSession(session_id);
  const effectiveFaculty = faculty_override ?? session.faculty_context ?? null;

  // ── 3. Query classification ──
  const classification = classifyQuery(message, effectiveFaculty);

  // ── 4. Follow-up handling ──
  let resolvedFaculty = classification.faculty_id;
  let resolvedScope = classification.scope;
  let resolvedTopicTags = [...classification.topic_tags];
  let followupParentId: string | null = null;

  // Keep prior topic context when user sends short follow-up (e.g. just "zabrze").
  if (classification.is_follow_up && resolvedTopicTags.length === 0 && session.last_resolved_topic_tags.length > 0) {
    resolvedTopicTags = [...session.last_resolved_topic_tags];
  }

  if (classification.is_follow_up && session.last_message_type) {
    if (canInheritContext(session)) {
      // Full inheritance
      resolvedFaculty = session.last_resolved_faculty_id;
      resolvedScope = session.last_resolved_scope ?? classification.scope;
      if (resolvedTopicTags.length === 0 && session.last_resolved_topic_tags.length > 0) {
        resolvedTopicTags = [...session.last_resolved_topic_tags];
      }
    } else if (canInheritContextCautious(session)) {
      resolvedFaculty = session.last_resolved_faculty_id;
      resolvedScope = session.last_resolved_scope ?? classification.scope;
      if (resolvedTopicTags.length === 0 && session.last_resolved_topic_tags.length > 0) {
        resolvedTopicTags = [...session.last_resolved_topic_tags];
      }
    } else if (session.last_resolved_topic_tags.length > 0) {
      // Allow topic-only inheritance for minimal follow-ups when context exists.
      resolvedScope = session.last_resolved_scope ?? classification.scope;
      if (!resolvedFaculty) {
        resolvedFaculty = session.last_resolved_faculty_id;
      }
      if (resolvedTopicTags.length === 0) {
        resolvedTopicTags = [...session.last_resolved_topic_tags];
      }
    } else {
      // Low confidence follow-up → clarification
      return res.json({
        session_id: session.id,
        answer: 'Nie jestem pewien, czego dotyczy Twoje pytanie. Czy możesz podać więcej szczegółów lub powtórzyć pełne pytanie?',
        response_type: 'clarification',
        sources: [],
        final_answer_confidence: 0,
        clarification_question: 'Proszę, doprecyzuj o co dokładnie chodzi?',
        suggested_questions: [
          'Czy pytasz o stypendium, praktyki, harmonogram czy dziekanat?',
          'Czy chcesz informacje ogolne czy dla konkretnego wydzialu?',
          'Czy mam podac od razu odpowiedni link do strony?',
        ],
      });
    }
  }

  // Clarify if ambiguous and not enough context
  if (classification.is_ambiguous && !resolvedFaculty && classification.topic_tags.length === 0) {
    return res.json({
      session_id: session.id,
      answer: 'Twoje pytanie jest dość ogólne. Czy możesz podać więcej szczegółów? W czym dokładnie mogę Ci pomóc?',
      response_type: 'clarification',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: 'O co dokładnie chodzi? (np. stypendium, praktyki, dziekanat...)',
      suggested_questions: [
        'Czy chodzi o stypendium, praktyki, harmonogram czy dziekanat?',
        'Czy mam podac informacje dla konkretnego wydzialu?',
        'Czy chcesz od razu link do odpowiedniej strony?',
      ],
    });
  }

  // Faculty clarification: If asking about faculty-specific topic but no faculty specified, ask which one
  // Faculty-specific topics: dziekanat, harmonogram, egzamin, praktyki, kontakt, akademik (for specific faculty)
  const FACULTY_SPECIFIC_TOPICS = ['dziekanat', 'harmonogram', 'egzamin', 'praktyki', 'kontakt', 'akademik'];
  const hasFacultySpecificTopic = classification.topic_tags.some(tag => FACULTY_SPECIFIC_TOPICS.includes(tag));
  
  if (
    hasFacultySpecificTopic &&
    !resolvedFaculty &&
    !classification.is_follow_up &&
    classification.faculty_detection_confidence < 0.65
  ) {
    // User is asking about a faculty-specific topic but hasn't specified which faculty
    return res.json({
      session_id: session.id,
      answer: `Pytasz o ${classification.topic_tags.join(', ')}. Który dziekanat Cię interesuje?`,
      response_type: 'clarification',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: 'Wybrań dziekanat:',
      suggested_questions: [
        'Medycyna - Zabrze',
        'Medycyna - Katowice',
        'Nauki o Zdrowiu - Katowice',
        'Farmacja - Sosnowiec',
        'Filia - Bielsko-Biała',
      ],
    });
  }

  // ── 5. Save user message ──
  const userMsgId = await saveMessage(session.id, {
    role: 'user',
    content: message,
    message_type: classification.is_follow_up ? 'follow-up' : 'normal',
    resolved_scope: resolvedScope,
    resolved_faculty_id: resolvedFaculty,
    query_classification_confidence: classification.query_classification_confidence,
    faculty_detection_confidence: classification.faculty_detection_confidence,
  });

  // ── 6. Embedding ──
  let embedding: number[];
  try {
    embedding = await getEmbedding(message);
  } catch (err) {
    console.error('[Chat] Embedding error:', err);
    return res.status(503).json({ error: 'Embedding service unavailable. Try again.' });
  }

  // ── 7. Retrieval ──
  const retrieval = await retrieveChunks(
    message,
    embedding,
    resolvedScope,
    resolvedFaculty,
    resolvedTopicTags
  );

  // ── 8. Answer Pipeline ──
  const answer = await generateAnswer(
    message,
    retrieval.chunks,
    retrieval.retrieval_confidence,
    resolvedScope,
    resolvedFaculty,
    resolvedScope === 'general'
  );

  const isGeneralLegitymacja =
    resolvedScope === 'general' && resolvedTopicTags.includes('legitymacja');

  if (isGeneralLegitymacja) {
    const asksForFaculty = /wydzia[łl]|z którego wydziału|wybierz swój wydział/i.test(answer.answer_text);
    if (asksForFaculty || answer.response_type !== 'answer') {
      answer.answer_text =
        'Informacje o legitymacji studenckiej (wydanie, przedłużenie, zgubienie i mLegitymacja) znajdziesz na stronie usług informatycznych dla studentów: https://student.sum.edu.pl/uslugi-informatyczne-dla-studentow/';
      answer.response_type = 'answer';
      answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.8);
      answer.clarification_question = null;
      answer.sources = [
        {
          url: 'https://student.sum.edu.pl/uslugi-informatyczne-dla-studentow/',
          title: 'Usługi informatyczne dla studentów',
          excerpt: 'Informacje o legitymacji studenckiej i mLegitymacji.',
          publish_date: null,
        },
      ];
    }
  }

  // ── 9. Moderation: output ──
  answer.answer_text = stripSuggestedSection(answer.answer_text);

  const outputMod = moderateOutput(answer.answer_text);
  if (outputMod.blocked) {
    answer.answer_text = 'Odpowiedź nie może być wyświetlona.';
    answer.response_type = 'refusal';
  }

  // Never expose model-invented sources; return only sources from retrieval.
  answer.sources = retrieval.chunks.map((c) => ({
    url: c.source_url,
    title: c.title ?? c.source_url,
    excerpt: c.text.slice(0, 280),
    publish_date: c.publish_date,
  }));

  // ── 10. Persist assistant message ──
  const sources = retrieval.chunks.map(c => ({ url: c.source_url, title: c.title }));

  const assistantMsgId = await saveMessage(session.id, {
    role: 'assistant',
    content: answer.answer_text,
    message_type: classification.is_follow_up ? 'follow-up' : 'normal',
    response_type: answer.response_type,
    resolved_scope: resolvedScope,
    resolved_faculty_id: resolvedFaculty,
    query_classification_confidence: classification.query_classification_confidence,
    faculty_detection_confidence: classification.faculty_detection_confidence,
    retrieval_confidence: retrieval.retrieval_confidence,
    final_answer_confidence: answer.final_answer_confidence,
    retrieved_sources: sources,
    followup_parent_message_id: followupParentId,
  });

  // ── 11. Update session state ──
  await updateSession(session.id, {
    faculty_context: effectiveFaculty,
    last_resolved_faculty_id: resolvedFaculty,
    last_resolved_scope: resolvedScope,
    last_resolved_topic_tags: resolvedTopicTags,
    last_source_urls: retrieval.chunks.map(c => c.source_url),
    last_answer_confidence: answer.final_answer_confidence,
    last_retrieval_confidence: retrieval.retrieval_confidence,
    last_message_type: classification.is_follow_up ? 'follow-up' : 'normal',
  });

  // ── 12. Analytics ──
  const latency = Date.now() - startTime;
  await logEvent({
    session_id: session.id,
    message_id: assistantMsgId,
    event_type: 'chat_message',
    intent: classification.intent,
    faculty_context: resolvedFaculty,
    retrieval_confidence: retrieval.retrieval_confidence,
    final_answer_confidence: answer.final_answer_confidence,
    latency_ms: latency,
    fallback_reason: answer.response_type === 'fallback' ? 'low_retrieval_confidence' : null,
  });

  // ── 13. Response ──
  // Add confidence warning banner
  let confidenceNote: string | null = null;
  if (answer.final_answer_confidence > 0 && answer.final_answer_confidence < 0.80) {
    confidenceNote = answer.final_answer_confidence >= 0.60
      ? 'Informacja może wymagać weryfikacji.'
      : 'Informacja może być niepełna — sprawdź bezpośrednio w źródle.';
  }

  const suggestedQuestions = buildSuggestedQuestions({
    currentTopicTags: resolvedTopicTags,
    previousTopicTags: session.last_resolved_topic_tags,
    answerText: answer.answer_text,
    userMessage: message,
    isFollowUp: classification.is_follow_up,
    responseType: answer.response_type,
    scope: resolvedScope,
    facultyId: resolvedFaculty,
  });

  return res.json({
    session_id: session.id,
    answer: answer.answer_text,
    response_type: answer.response_type,
    sources: answer.sources,
    final_answer_confidence: answer.final_answer_confidence,
    retrieval_confidence: retrieval.retrieval_confidence,
    clarification_question: answer.clarification_question,
    suggested_questions: suggestedQuestions,
    confidence_note: confidenceNote,
    resolved_scope: resolvedScope,
    resolved_faculty_id: resolvedFaculty,
    latency_ms: latency,
  });
});

// GET /api/chat/session/:sessionId
chatRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const messages = await getSessionMessages(req.params.sessionId);
    res.json({ session_id: req.params.sessionId, messages });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

// DELETE /api/chat/session/:sessionId
chatRouter.delete('/session/:sessionId', async (req, res) => {
  await resetSession(req.params.sessionId);
  res.json({ ok: true });
});
