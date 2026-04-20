"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAnswer = generateAnswer;
exports.getEmbedding = getEmbedding;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
// ── Structured Output schema ─────────────────────────────────────────────────
const AnswerSchema = zod_1.z.object({
    answer_text: zod_1.z.string(),
    final_answer_confidence: zod_1.z.number().min(0).max(1),
    sources: zod_1.z.array(zod_1.z.object({
        url: zod_1.z.string(),
        title: zod_1.z.string(),
        excerpt: zod_1.z.string().optional().default(''),
        publish_date: zod_1.z.string().nullable().optional(),
    })),
    response_type: zod_1.z.enum(['answer', 'fallback', 'clarification', 'refusal']),
    clarification_question: zod_1.z.string().nullable().default(null),
});
const JSON_SCHEMA = {
    name: 'chatbot_response',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            answer_text: { type: 'string' },
            final_answer_confidence: { type: 'number' },
            sources: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' },
                        title: { type: 'string' },
                        excerpt: { type: 'string' },
                        publish_date: { type: ['string', 'null'] },
                    },
                    required: ['url', 'title', 'excerpt', 'publish_date'],
                    additionalProperties: false,
                },
            },
            response_type: { type: 'string', enum: ['answer', 'fallback', 'clarification', 'refusal'] },
            clarification_question: { type: ['string', 'null'] },
        },
        required: ['answer_text', 'final_answer_confidence', 'sources', 'response_type', 'clarification_question'],
        additionalProperties: false,
    },
};
// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(scope, faculty_id, isGeneralQuery) {
    const facultyHint = faculty_id
        ? `Użytkownik jest przypisany do wydziału: ${faculty_id}.`
        : 'Pytanie dotyczy tematyki ogólnouniwersyteckiej.';
    return `Jesteś Asystentem Studenta Śląskiego Uniwersytetu Medycznego (ŚUM).
Odpowiadasz WYŁĄCZNIE na podstawie dostarczonych fragmentów wiedzy (chunks).
NIE możesz korzystać z własnej wiedzy jako źródła faktów.
NIE domyślaj się, nie zgaduj, nie generuj informacji niepotwierdzonych w źródłach.

${facultyHint}
Zakres: ${isGeneralQuery ? 'OGÓLNY (wszystkie wydziały)' : `WYDZIAŁOWY (${faculty_id ?? 'nieznany'})`}.

REGUŁY ODPOWIEDZI:
- Jeśli fragmenty wiedzy zawierają odpowiedź → odpowiadaj po polsku, cytuj źródła z tytułem i linkiem.
- Jeśli fragmenty wiedzy NIE zawierają odpowiedzi → response_type="fallback", final_answer_confidence=0.
- Jeśli pytanie jest wieloznaczne → response_type="clarification", zadaj jedno konkretne pytanie doprecyzowujące.
- Nigdy nie mieszaj informacji z różnych wydziałów.
- Dla tematów ogólnych (np. legitymacja, stypendium, ubezpieczenie, Erasmus) nie pytaj o wydział i nie wypisuj listy wydziałów, chyba że użytkownik wyraźnie o to prosi.
- Nigdy nie dodawaj informacji z własnej wiedzy.
- W sources wstaw TYLKO źródła użyte w odpowiedzi.

FORMAT: Odpowiedz WYŁĄCZNIE JSON zgodnym ze schematem. Żadnego tłumaczenia ani kodu poza JSON.`;
}
// ── Main pipeline ─────────────────────────────────────────────────────────────
async function generateAnswer(query, chunks, retrieval_confidence, scope, faculty_id, isGeneralQuery) {
    // Strict guard — do not call LLM with insufficient context
    if (chunks.length === 0 || retrieval_confidence < 0.55) {
        return buildFallback('Nie znaleziono wystarczających informacji w bazie wiedzy.');
    }
    const context = chunks.map((c, i) => `[Źródło ${i + 1}] ${c.title ?? ''} (${c.source_url})\n${c.text}`).join('\n\n---\n\n');
    const userContent = `PYTANIE STUDENTA: ${query}\n\nFRAGMENTY WIEDZY:\n${context}`;
    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
            messages: [
                { role: 'system', content: buildSystemPrompt(scope, faculty_id, isGeneralQuery) },
                { role: 'user', content: userContent },
            ],
            temperature: 0.1,
            max_tokens: 1200,
        });
        const raw = response.choices[0]?.message?.content;
        if (!raw)
            return buildFallback('Brak odpowiedzi od modelu.');
        const parsed = JSON.parse(raw);
        const validated = AnswerSchema.safeParse(parsed);
        if (!validated.success) {
            console.error('[Pipeline] Invalid LLM output:', validated.error.flatten());
            return buildFallback('Odpowiedź modelu nie spełnia wymagań formatu.');
        }
        // Apply confidence thresholds
        const ans = validated.data;
        if (ans.final_answer_confidence < 0.60) {
            return {
                ...ans,
                response_type: 'clarification',
                answer_text: ans.clarification_question ?? 'Czy możesz doprecyzować pytanie?',
            };
        }
        return ans;
    }
    catch (err) {
        console.error('[Pipeline] OpenAI error:', err);
        return buildFallback('Wystąpił błąd podczas generowania odpowiedzi. Spróbuj ponownie.');
    }
}
async function getEmbedding(text) {
    const embModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
    const res = await openai.embeddings.create({
        model: embModel,
        input: text.slice(0, 8000),
    });
    return res.data[0].embedding;
}
function buildFallback(reason) {
    return {
        answer_text: `Przepraszam, nie znalazłem wystarczających informacji, aby odpowiedzieć na to pytanie na podstawie dostępnych danych. Spróbuj skontaktować się bezpośrednio z dziekanatem swojego wydziału lub odwiedź stronę: https://student.sum.edu.pl`,
        final_answer_confidence: 0,
        sources: [],
        response_type: 'fallback',
        clarification_question: null,
    };
}
