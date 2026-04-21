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
import { buildActionButtons } from '../lib/actionButtons';

export const chatRouter = Router();

const INSURANCE_PAGE_URL = 'https://student.sum.edu.pl/ubezpieczenie-studentow-i-doktorantow/';
const WP_API_BASE = process.env.WP_BASE_URL ?? 'https://student.sum.edu.pl/wp-json/wp/v2';

interface WpSummaryItem {
  id: number;
  slug: string;
  link: string;
  type: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
}

type InsuranceVariantId = 'zdrowotne' | 'nnw' | 'oc';

const INSURANCE_VARIANTS: Array<{
  id: InsuranceVariantId;
  label: string;
  keywords: string[];
  intro: string;
  nextStep: string;
  detailsLinkLabel: string;
  detailsLinkUrl: string;
}> = [
  {
    id: 'zdrowotne',
    label: 'Ubezpieczenie zdrowotne',
    keywords: ['zdrowotne', 'zdrowotny', 'nfz', 'skladka zdrowotna'],
    intro: 'Ubezpieczenie zdrowotne gwarantuje Ci dostęp do świadczeń medycznych NFZ. Aby się rejestrować się przez Uczelnię, musisz być zarejestowany w PESEL, być studentem i mieć ważną legitymację. Uczela zgłasza Cię zbiorowo do NFZ — o tym decyduje Twój stan na dacie zgłoszenia. Jeśli chcesz, żeby Uczela zgłosiła Cię do ubezpieczenia, musisz złożyć wniosek do NFZ z pieczęcią Uczelni — formularz jest dostępny w dziekanacie.',
    nextStep: 'Pierwszym krokiem jest złożenie wniosku w dziekanacie Twojego wydziału lub bezpośrednio w NFZ z potwierdzeniem z Uczelni.',
    detailsLinkLabel: 'Wniosek o objęcie ubezpieczeniem zdrowotnym (NFZ)',
    detailsLinkUrl: 'https://student.sum.edu.pl/wp-content/uploads/2026/02/Wniosek_ubezp_zdrowotne_NFZ.pdf',
  },
  {
    id: 'nnw',
    label: 'Ubezpieczenie NNW',
    keywords: ['nnw', 'nastepstw nieszczesliwych wypadkow', 'następstw nieszczęśliwych wypadków'],
    intro: 'Ubezpieczenie NNW dotyczy następstw nieszczęśliwych wypadków. Dostępne są warianty A i B z różnymi limitami ochrony, oraz warianty I, II i II+ z różnymi poziomami rocznych składek.',
    nextStep: 'Najczęściej wybiera się wariant II (NNW + OC w życiu prywatnym + OC praktykanta) za 55 zł rocznie. Szczegółowe informacje dostępne są na stronie ubezpieczenia.',
    detailsLinkLabel: 'Ubezpieczenie studentów i doktorantów',
    detailsLinkUrl: INSURANCE_PAGE_URL,
  },
  {
    id: 'oc',
    label: 'Ubezpieczenie OC',
    keywords: ['oc', 'odpowiedzialnosci cywilnej', 'odpowiedzialności cywilnej'],
    intro: 'Ubezpieczenie OC dotyczy odpowiedzialności cywilnej, czyli szkód wyrządzonych osobom trzecim. Dostępne są warianty z różnymi limitami i zakresem ochrony, w tym OC praktykanta dla studentów uczestniczących w praktykach.',
    nextStep: 'Najczęściej wybiera się wariant II (NNW + OC w życiu prywatnym + OC praktykanta) za 55 zł rocznie. Warianty różnią się ceną i zakresem ochrony.',
    detailsLinkLabel: 'Ubezpieczenie studentów i doktorantów',
    detailsLinkUrl: INSURANCE_PAGE_URL,
  },
];

function stripSuggestedSection(answerText: string): string {
  // Remove model-generated "Mozesz tez zapytac" section to avoid duplicate numbered lists.
  return answerText
    .replace(/\n\s*(Możesz też zapytać|Mozesz tez zapytac)\s*:\s*[\s\S]*$/i, '')
    .trim();
}

function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function normalizeSourceTitle(title: string): string {
  return title
    .replace(/\s*\((kopia|copy)\)\s*/gi, ' ')
    .replace(/\b(kopia|copy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildUniqueSources(chunks: Array<{ source_url: string; title: string | null; text: string; publish_date: string | null }>): Array<{ url: string; title: string; excerpt: string; publish_date: string | null }> {
  const unique = new Map<string, { url: string; title: string; excerpt: string; publish_date: string | null }>();
  const nonCopyTitles = new Set(
    chunks
      .map((chunk) => ({
        title: normalizeSourceTitle(chunk.title ?? chunk.source_url),
        raw: `${chunk.title ?? ''} ${chunk.source_url}`,
      }))
      .filter((row) => row.title && !/\b(kopia|copy)\b/i.test(row.raw))
      .map((row) => row.title.toLowerCase())
  );

  for (const chunk of chunks) {
    const url = normalizeSourceUrl(chunk.source_url);
    const title = normalizeSourceTitle(chunk.title ?? chunk.source_url) || url;
    const excerpt = chunk.text.slice(0, 280);
    const raw = `${chunk.title ?? ''} ${chunk.source_url}`;
    const candidateIsCopy = /\b(kopia|copy)\b/i.test(raw);

    if (candidateIsCopy && nonCopyTitles.has(title.toLowerCase())) {
      continue;
    }

    const current = unique.get(url);

    if (!current) {
      unique.set(url, { url, title, excerpt, publish_date: chunk.publish_date });
      continue;
    }

    const currentIsCopy = /\b(kopia|copy)\b/i.test(current.title);

    if (currentIsCopy && !candidateIsCopy) {
      unique.set(url, { url, title, excerpt, publish_date: chunk.publish_date });
      continue;
    }

    if (excerpt.length > current.excerpt.length) {
      unique.set(url, { ...current, excerpt, publish_date: chunk.publish_date });
    }
  }

  const values = Array.from(unique.values());
  const byTitle = new Set<string>();
  return values.filter((item) => {
    const key = item.title.toLowerCase();
    if (byTitle.has(key)) return false;
    byTitle.add(key);
    return true;
  });
}

function userExplicitlyWantsSource(message: string): boolean {
  return /(link|źródł|zrodl|stron|regulamin|oficjaln|potwierd|podstawa|gdzie znajd|daj link|pokaż link|pokaz link)/i.test(message);
}

function userAsksAboutPrice(message: string): boolean {
  return /(ile kosztuje|koszt|cena|warianty cenowe|skladka|skladki|oplata|oplatach)/i.test(message.toLowerCase());
}

function buildInsurancePricingSummary(chunks: Array<{ text: string }>): string | null {
  const raw = chunks.map((c) => c.text).join('\n');
  if (!raw) return null;

  const lines: string[] = [];

  // Capture common annual premium variants (I / II / II+), if present in retrieved text.
  const premiumMatches = raw.match(/Wariant\s+(?:I\+?|II\+?|III|A|B)[\s\S]{0,140}?\d{1,3}[,.]\d{2}[\s\S]{0,80}?\d{1,3}[,.]\d{2}/gi) ?? [];
  for (const match of premiumMatches.slice(0, 3)) {
    const compact = match
      .replace(/\s+/g, ' ')
      .replace(/\s+zł/gi, ' zł')
      .trim();
    lines.push(`- ${compact}`);
  }

  // Capture OC limits for variants A/B if present.
  const limitA = raw.match(/Wariant\s*A[\s\S]{0,120}?OC[^\d]{0,40}(\d[\d\s.]{2,})\s*zł/i);
  const limitB = raw.match(/Wariant\s*B[\s\S]{0,120}?OC[^\d]{0,40}(\d[\d\s.]{2,})\s*zł/i);
  if (limitA?.[1]) lines.push(`- Limit OC w wariancie A: ${limitA[1].replace(/\s+/g, '')} zł`);
  if (limitB?.[1]) lines.push(`- Limit OC w wariancie B: ${limitB[1].replace(/\s+/g, '')} zł`);

  if (lines.length === 0) return null;
  return `Na stronie są podane warianty cenowe i limity OC:\n${lines.join('\n')}`;
}

function detectInsuranceVariant(message: string): InsuranceVariantId | null {
  const lower = message.toLowerCase();
  for (const variant of INSURANCE_VARIANTS) {
    if (variant.keywords.some((k) => lower.includes(k))) return variant.id;
  }
  return null;
}

function buildRetrievalQuery(
  message: string,
  topicTags: string[],
  facultyId: string | null,
  isFollowUp: boolean
): string {
  if (!isFollowUp) return message;

  const lower = message.toLowerCase();
  const missingTopics = topicTags.filter((tag) => !lower.includes(tag));
  const facultyToken = facultyId && !lower.includes(facultyId) ? facultyId : null;

  if (missingTopics.length === 0 && !facultyToken) {
    return message;
  }

  return [...missingTopics, facultyToken, message]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function extractSummaryRequestUrl(message: string): string | null {
  if (!/(kr[oó]tko opisz|podaj link)/i.test(message)) return null;
  const match = message.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].trim() : null;
}

function stripHtmlText(value: string): string {
  return value
    .replace(/<wbr\s*\/?>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#8211;|&#8212;/gi, '-')
    .replace(/&#8217;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSubsectionLabel(value: string): string {
  return stripHtmlText(value)
    .replace(/[\s:,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulSubsection(text: string, pageTitle: string, stoplist: Set<string>): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const normalizedPageTitle = pageTitle.toLowerCase().trim();

  if (normalized.length < 3 || normalized.length > 90) return false;
  if (stoplist.has(lower)) return false;
  if (lower === pageTitle.toLowerCase()) return false;
  if (normalizedPageTitle && lower.startsWith(normalizedPageTitle)) return false;
  if (/@|https?:\/\/|www\./i.test(normalized)) return false;
  if (/(^|\s)(rozwi(?:ń|n)|zwi(?:ń|n))($|\s)/i.test(normalized)) return false;
  if (/\b(tel\.?|telefon|e-mail|email)\b/i.test(normalized)) return false;
  if (/\b(zakwalifikowani|rezerwow[a-z]*)\b/i.test(normalized)) return false;
  if (/^\d+[.)\-\s]/.test(normalized)) return false;
  if ((normalized.match(/\d/g) ?? []).length >= 5) return false;

  return true;
}

function collectUniqueSubsections(items: string[], limit: number): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function extractSubsectionsFromHtml(html: string, pageTitle: string): string[] {
  const stoplist = new Set([
    'Wsparcie IT', 'Welcome Centre', 'BHP', 'Edukacja zdalna', 'Platforma e-learningowa',
    'Bazy medyczne', 'Biblioteka SUM', 'Deklaracja dostępności', 'BIP', 'Polityka Prywatności',
    'Czytaj więcej', 'Przejdź do wszystkich artykułów', 'Dowiedz się więcej', 'Rozwiń', 'Zwiń',
    pageTitle,
  ].map((item) => item.toLowerCase()));

  const accordionLabels: string[] = [];
  const accordionRegexes = [
    /<div class="e-n-accordion-item-title-text">([\s\S]*?)<\/div>/gi,
    /<summary[^>]*class="[^"]*e-n-accordion-item-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/summary>/gi,
    /<div[^>]*class="[^"]*elementor-tab-title[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const regex of accordionRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const text = normalizeSubsectionLabel(match[1] ?? '');
      if (!isMeaningfulSubsection(text, pageTitle, stoplist)) continue;
      accordionLabels.push(text);
    }
  }

  const headings: string[] = [];
  const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const text = normalizeSubsectionLabel(headingMatch[1] ?? '');
    if (isMeaningfulSubsection(text, pageTitle, stoplist)) headings.push(text);
  }

  return collectUniqueSubsections([...accordionLabels, ...headings], 10);
}

async function fetchWpItemByUrl(targetUrl: string): Promise<WpSummaryItem | null> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return null;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
  const slug = normalizedPath.split('/').filter(Boolean).pop();
  if (!slug) return null;

  const endpoints = ['pages', 'posts', 'placowki'];
  const fields = '_fields=id,slug,link,type,title,excerpt,content';

  for (const endpoint of endpoints) {
    const url = `${WP_API_BASE}/${endpoint}?slug=${encodeURIComponent(slug)}&${fields}`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const items = await response.json() as WpSummaryItem[];
      if (!Array.isArray(items) || items.length === 0) continue;

      const byPath = items.find((item) => {
        try {
          const itemPath = new URL(item.link).pathname.replace(/\/+$/, '') || '/';
          return itemPath === normalizedPath;
        } catch {
          return false;
        }
      });

      return byPath ?? items[0] ?? null;
    } catch {
      continue;
    }
  }

  return null;
}

async function buildDynamicPageSummaryFromUrl(targetUrl: string): Promise<string | null> {
  const item = await fetchWpItemByUrl(targetUrl);
  if (!item) return null;

  const title = stripHtmlText(item.title?.rendered ?? '').trim() || targetUrl;
  const excerpt = stripHtmlText(item.excerpt?.rendered ?? '').trim();
  const content = stripHtmlText(item.content?.rendered ?? '').trim();
  const summarySource = excerpt || content;
  const summary = summarySource
    ? summarySource.slice(0, 260).replace(/\s+[\S]*$/, '').trim() + (summarySource.length > 260 ? '...' : '')
    : `Na tej stronie znajdziesz informacje dotyczące: ${title}.`;

  const rawHtml = `${item.content?.rendered ?? ''}`;
  const subsections = extractSubsectionsFromHtml(rawHtml, title);
  const subsectionBlock = subsections.length > 0
    ? `\n\nPodsekcje na tej stronie:\n${subsections.map((section, index) => `${index + 1}. ${section}`).join('\n')}`
    : '';

  const finalUrl = item.link || targetUrl;
  return `${summary}${subsectionBlock}\n\nWięcej informacji znajdziesz na stronie: [${title}](${finalUrl}).`;
}

async function buildDeterministicPageSummary(message: string): Promise<string | null> {
  const requestedUrl = extractSummaryRequestUrl(message);
  if (!requestedUrl) return null;
  return buildDynamicPageSummaryFromUrl(requestedUrl);
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
  const insuranceVariantId = detectInsuranceVariant(message);

  const deterministicPageSummary = await buildDeterministicPageSummary(message);
  if (deterministicPageSummary) {
    const userMsgId = await saveMessage(session.id, {
      role: 'user',
      content: message,
      message_type: 'normal',
      resolved_scope: 'general',
      resolved_faculty_id: null,
      query_classification_confidence: classification.query_classification_confidence,
      faculty_detection_confidence: classification.faculty_detection_confidence,
    });

    const assistantMsgId = await saveMessage(session.id, {
      role: 'assistant',
      content: deterministicPageSummary,
      message_type: 'normal',
      response_type: 'answer',
      resolved_scope: 'general',
      resolved_faculty_id: null,
      query_classification_confidence: classification.query_classification_confidence,
      faculty_detection_confidence: classification.faculty_detection_confidence,
      retrieval_confidence: 0.95,
      final_answer_confidence: 0.95,
      retrieved_sources: [],
      followup_parent_message_id: userMsgId,
    });

    const latency = Date.now() - startTime;
    await updateSession(session.id, {
      faculty_context: null,
      last_resolved_faculty_id: null,
      last_resolved_scope: 'general',
      last_resolved_topic_tags: ['akademik'],
      last_source_urls: [],
      last_answer_confidence: 0.95,
      last_retrieval_confidence: 0.95,
      last_message_type: 'normal',
    });

    await logEvent({
      session_id: session.id,
      message_id: assistantMsgId,
      event_type: 'chat_message',
      intent: classification.intent,
      faculty_context: null,
      retrieval_confidence: 0.95,
      final_answer_confidence: 0.95,
      latency_ms: latency,
      fallback_reason: null,
    });

    return res.json({
      session_id: session.id,
      answer: deterministicPageSummary,
      response_type: 'answer',
      sources: [],
      final_answer_confidence: 0.95,
      retrieval_confidence: 0.95,
      clarification_question: null,
      suggested_questions: [],
      action_buttons: [],
      confidence_note: null,
      resolved_scope: 'general',
      resolved_faculty_id: null,
      latency_ms: latency,
    });
  }

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

  if (
    resolvedScope === 'general' &&
    classification.topic_tags.includes('ubezpieczenie') &&
    !insuranceVariantId
  ) {
    return res.json({
      session_id: session.id,
      answer: 'Ubezpieczenia studenckie najczęściej dzielą się na trzy obszary: zdrowotne, NNW i OC. Każdy z nich dotyczy czegoś innego.',
      response_type: 'clarification',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: 'O które ubezpieczenie chodzi: zdrowotne, NNW czy OC?',
      suggested_questions: [
        'Ubezpieczenie zdrowotne',
        'Ubezpieczenie NNW',
        'Ubezpieczenie OC',
      ],
    });
  }

  // Faculty clarification: If asking about faculty-specific topic but no faculty specified, ask which one.
  // NOTE: "akademik" is intentionally excluded because it is a general topic on SUM.
  const FACULTY_SPECIFIC_TOPICS = ['dziekanat', 'harmonogram', 'egzamin', 'praktyki', 'kontakt'];
  const hasFacultySpecificTopic = classification.topic_tags.some(tag => FACULTY_SPECIFIC_TOPICS.includes(tag));
  
  if (
    hasFacultySpecificTopic &&
    !resolvedFaculty &&
    !classification.is_follow_up &&
    classification.faculty_detection_confidence < 0.65
  ) {
    const topicLabel = classification.topic_tags.includes('harmonogram')
      ? 'harmonogram'
      : classification.topic_tags.join(', ');
    await updateSession(session.id, {
      last_resolved_scope: 'faculty',
      last_resolved_faculty_id: null,
      last_resolved_topic_tags: classification.topic_tags,
      last_message_type: 'clarification',
      last_clarification_reason: 'faculty-selection',
      last_answer_confidence: 0,
      last_retrieval_confidence: 0,
    });
    // User is asking about a faculty-specific topic but hasn't specified which faculty
    return res.json({
      session_id: session.id,
      answer: `Pytasz o ${topicLabel}. Który wydział Cię interesuje?`,
      response_type: 'clarification',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: 'Wybierz wydział:',
      suggested_questions: [
        'WNMZ',
        'WNMK',
        'WNOZK',
        'WNFS',
        'WZPB',
        'FBB',
      ],
    });
  }

  // Program clarification: If WNoZK + harmonogram but no specific program mentioned, ask which one
  const { FACULTY_PROGRAMS } = await import('../lib/queryRouter');
  if (classification.needs_program_clarification) {
    const programs = FACULTY_PROGRAMS['wnozk'] || [];
    const programLabels = programs.map(p => p.name);
    await updateSession(session.id, {
      last_resolved_scope: 'faculty',
      last_resolved_faculty_id: 'wnozk',
      last_resolved_topic_tags: classification.topic_tags,
      last_message_type: 'clarification',
      last_clarification_reason: 'program-selection',
      last_answer_confidence: 0,
      last_retrieval_confidence: 0,
    });
    return res.json({
      session_id: session.id,
      answer: `Na Wydziale Nauk o Zdrowiu w Katowicach harmonogramy różnią się w zależności od kierunku. Który kierunek Cię interesuje?`,
      response_type: 'clarification',
      sources: [],
      final_answer_confidence: 0,
      clarification_question: 'Wybierz kierunek:',
      cta_buttons: programLabels,  // Strukturyzowany format do renderowania buttonów
      suggested_questions: programLabels.map(p => `Harmonogram - ${p}`),
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
  const retrievalQuery = buildRetrievalQuery(
    message,
    resolvedTopicTags,
    resolvedFaculty,
    classification.is_follow_up
  );

  let embedding: number[];
  try {
    embedding = await getEmbedding(retrievalQuery);
  } catch (err) {
    console.error('[Chat] Embedding error:', err);
    return res.status(503).json({ error: 'Embedding service unavailable. Try again.' });
  }

  // ── 7. Retrieval ──
  const retrieval = await retrieveChunks(
    retrievalQuery,
    embedding,
    resolvedScope,
    resolvedFaculty,
    resolvedTopicTags
  );

  // ── 8. Answer Pipeline ──
  const answer = await generateAnswer(
    retrievalQuery,
    retrieval.chunks,
    retrieval.retrieval_confidence,
    resolvedScope,
    resolvedFaculty,
    resolvedScope === 'general'
  );

  const isGeneralLegitymacja =
    resolvedScope === 'general' && resolvedTopicTags.includes('legitymacja');
  const isGeneralStypendium =
    resolvedScope === 'general' && resolvedTopicTags.includes('stypendium');
  const isGeneralPraktyki =
    resolvedScope === 'general' && resolvedTopicTags.includes('praktyki');
  const isGeneralUbezpieczenie =
    resolvedScope === 'general' && resolvedTopicTags.includes('ubezpieczenie');
  const wantsSource = userExplicitlyWantsSource(message);
  let autoComposedAnswer = false;

  if (isGeneralLegitymacja) {
    const asksForFaculty = /wydzia[łl]|z którego wydziału|wybierz swój wydział/i.test(answer.answer_text);
    if (asksForFaculty || answer.response_type !== 'answer') {
      answer.answer_text =
        'Legitymacja studencka potwierdza Twój status studenta. Najczęściej chodzi o jej wydanie, przedłużenie ważności, mLegitymację albo duplikat po zgubieniu. Jeśli chcesz, mogę rozpisać jeden z tych tematów krok po kroku.';
      answer.response_type = 'answer';
      answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.8);
      answer.clarification_question = null;
      autoComposedAnswer = true;
    }
  }

  if (isGeneralStypendium && retrieval.chunks.length > 0) {
    answer.answer_text =
      'Na SUM najczęściej spotkasz cztery formy wsparcia: stypendium Rektora, stypendium socjalne, stypendium Ministra i zapomogę. To, z czego możesz skorzystać, zależy od Twojej sytuacji materialnej, wyników w nauce albo szczególnej sytuacji życiowej. Jeśli chcesz, mogę krótko wyjaśnić różnicę między nimi albo opisać jedną z tych form dokładniej.';
    answer.response_type = 'answer';
    answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.85);
    answer.clarification_question = null;
    autoComposedAnswer = true;
  }

  if (isGeneralPraktyki && retrieval.chunks.length > 0 && answer.response_type !== 'answer') {
    answer.answer_text =
      'Praktyki zawodowe zwykle wymagają sprawdzenia czterech rzeczy: zasad zaliczenia, wymaganych dokumentów, terminów oraz miejsca odbywania praktyk. Szczegóły mogą zależeć od kierunku i wydziału. Jeśli chcesz, mogę doprecyzować to dla Twojego wydziału albo rozpisać, od czego zacząć.';
    answer.response_type = 'answer';
    answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.75);
    answer.clarification_question = null;
    autoComposedAnswer = true;
  }

  if (isGeneralUbezpieczenie && insuranceVariantId) {
    const variant = INSURANCE_VARIANTS.find((v) => v.id === insuranceVariantId);
    if (variant) {
      const asksPrice = userAsksAboutPrice(message);
      const pricingSummary = asksPrice ? buildInsurancePricingSummary(retrieval.chunks) : null;
      // Let the model generate from retrieval, then append practical steps
      if (answer.response_type === 'answer' && answer.answer_text) {
        // Model generated real content from retrieval – append next step and link
        const pricingPart = pricingSummary ? `${pricingSummary}\n\n` : '';
        answer.answer_text = `${answer.answer_text}\n\n${pricingPart}${variant.nextStep} Możesz też sprawdzić: [${variant.detailsLinkLabel}](${variant.detailsLinkUrl}).`;
      } else {
        // Model didn't generate well – use template
        const pricingPart = pricingSummary ? `${pricingSummary}\n\n` : '';
        answer.answer_text = `${variant.intro}\n\n${pricingPart}${variant.nextStep} Jeśli chcesz więcej szczegółów, sprawdź: [${variant.detailsLinkLabel}](${variant.detailsLinkUrl}).`;
        answer.response_type = 'answer';
      }
      answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.85);
      answer.clarification_question = null;
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
  answer.sources = buildUniqueSources(retrieval.chunks);

  const actionButtons = await buildActionButtons({
    topicTags: resolvedTopicTags,
    scope: resolvedScope,
    facultyId: resolvedFaculty,
    responseType: answer.response_type,
    sourceUrls: answer.sources.map((source) => source.url),
  });

  if (
    resolvedScope === 'general' &&
    actionButtons.length > 0 &&
    (wantsSource || answer.response_type === 'fallback')
  ) {
    const firstDynamicLink = actionButtons.find((button) => button.kind === 'link' && button.url)?.url;
    if (firstDynamicLink) {
      const dynamicSummary = await buildDynamicPageSummaryFromUrl(firstDynamicLink);
      if (dynamicSummary) {
        answer.answer_text = dynamicSummary;
        answer.response_type = 'answer';
        answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.88);
        answer.clarification_question = null;
        answer.sources = [];
        autoComposedAnswer = true;
      }
    }
  }

  if (
    answer.response_type === 'fallback' &&
    resolvedScope === 'faculty' &&
    resolvedFaculty &&
    actionButtons.length > 0 &&
    (resolvedTopicTags.includes('harmonogram') || resolvedTopicTags.includes('egzamin'))
  ) {
    const linkButtons = actionButtons.filter(
      (button) => button.kind === 'link' && button.url
    );

    if (linkButtons.length > 0) {
      const isExamTopic = resolvedTopicTags.includes('egzamin');
      const topicLabel = isExamTopic
        ? 'harmonogramów egzaminów'
        : 'harmonogramów zajęć';
      const relevantButtons = linkButtons
        .filter((button) => {
          const haystack = `${button.label} ${button.url}`.toLowerCase();
          if (isExamTopic) {
            return /egzamin/.test(haystack);
          }
          return /harmonogram/.test(haystack);
        })
        .sort((a, b) => {
          const aHaystack = `${a.label} ${a.url}`.toLowerCase();
          const bHaystack = `${b.label} ${b.url}`.toLowerCase();

          if (isExamTopic) {
            return Number(/egzamin/.test(bHaystack)) - Number(/egzamin/.test(aHaystack));
          }

          const aScore = Number(/zaj[eę]c|zajec/.test(aHaystack)) * 2 + Number(/egzamin/.test(aHaystack));
          const bScore = Number(/zaj[eę]c|zajec/.test(bHaystack)) * 2 + Number(/egzamin/.test(bHaystack));
          return bScore - aScore;
        });

      const linksText = (relevantButtons.length > 0 ? relevantButtons : linkButtons)
        .slice(0, 4)
        .map((button, index) => `${index + 1}. [${button.label}](${button.url})`)
        .join('\n');

      answer.answer_text = `Dla ${resolvedFaculty.toUpperCase()} najlepiej sprawdzić te strony ${topicLabel}:\n\n${linksText}`;
      answer.response_type = 'answer';
      answer.final_answer_confidence = Math.max(answer.final_answer_confidence, 0.9);
      answer.clarification_question = null;
      autoComposedAnswer = true;
    }
  }

  // ── 10. Persist assistant message ──
  const sources = answer.sources.map((s) => ({ url: s.url, title: s.title }));

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

  const shouldSuppressAuxiliarySections = answer.response_type === 'answer' || autoComposedAnswer || !wantsSource;

  const shouldSuppressSuggestions =
    shouldSuppressAuxiliarySections ||
    (resolvedTopicTags.includes('praktyki') && answer.response_type === 'answer' && actionButtons.length > 0);

  let suggestedQuestions = shouldSuppressSuggestions
    ? []
    : buildSuggestedQuestions({
      currentTopicTags: resolvedTopicTags,
      previousTopicTags: session.last_resolved_topic_tags,
      answerText: answer.answer_text,
      userMessage: message,
      isFollowUp: classification.is_follow_up,
      responseType: answer.response_type,
      scope: resolvedScope,
      facultyId: resolvedFaculty,
    });

  if (answer.response_type === 'answer') {
    suggestedQuestions = [];
  }

  return res.json({
    session_id: session.id,
    answer: answer.answer_text,
    response_type: answer.response_type,
    sources: shouldSuppressAuxiliarySections ? [] : answer.sources,
    final_answer_confidence: answer.final_answer_confidence,
    retrieval_confidence: retrieval.retrieval_confidence,
    clarification_question: answer.clarification_question,
    suggested_questions: suggestedQuestions,
    action_buttons: shouldSuppressAuxiliarySections ? [] : actionButtons,
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
