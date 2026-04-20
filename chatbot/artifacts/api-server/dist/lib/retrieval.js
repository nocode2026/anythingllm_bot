"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveChunks = retrieveChunks;
const index_1 = require("@sum/db/src/index");
const DEFAULT_CONFIG = {
    full_text_weight: 0.45,
    vector_weight: 0.45,
    metadata_bonus_weight: 0.22,
    top_k: 6,
};
const CONFIDENCE_THRESHOLD_ANSWER = 0.75;
const CONFIDENCE_THRESHOLD_CAUTIOUS = 0.55;
async function retrieveChunks(queryText, queryEmbedding, scope, faculty_id, topic_tags, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const client = await index_1.pool.connect();
    try {
        // Build parameterized query
        const params = [];
        // Embedding as postgres vector literal
        const embeddingLiteral = `'[${queryEmbedding.join(',')}]'::vector`;
        // Scope/faculty filters — strict, never mixed
        const scopeFilter = `c.scope = $${params.push(scope)}`;
        const facultyFilter = scope === 'faculty' && faculty_id
            ? `AND c.faculty_id = $${params.push(faculty_id)}`
            : scope === 'general'
                ? 'AND c.faculty_id IS NULL'
                : '';
        // ts_query — Polish words joined by OR
        const tsWords = queryText
            .toLowerCase()
            .replace(/[^a-ząćęłńóśźż ]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2)
            .join(' | ');
        const tsQuery = tsWords.length > 0
            ? `$${params.push(tsWords)}::text`
            : `$${params.push(queryText)}::text`;
        const topK = params.push(cfg.top_k);
        const sql = `
      WITH ft AS (
        SELECT
          c.id,
          ts_rank_cd(c.ts_vector, to_tsquery('polish_unaccent', ${tsQuery})) AS ft_score
        FROM knowledge_chunks c
        WHERE ${scopeFilter} ${facultyFilter}
          AND c.ts_vector @@ to_tsquery('polish_unaccent', ${tsQuery})
      ),
      vec AS (
        SELECT
          c.id,
          1 - (c.embedding <=> ${embeddingLiteral}) AS vec_score
        FROM knowledge_chunks c
        WHERE ${scopeFilter} ${facultyFilter}
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${embeddingLiteral}
        LIMIT $${topK} * 5
      ),
      combined AS (
        SELECT
          c.id,
          c.text,
          c.source_url,
          c.title,
          c.scope,
          c.faculty_id,
          c.topic_tags,
          c.publish_date,
          coalesce(ft.ft_score, 0)  AS ft_score,
          coalesce(vec.vec_score, 0) AS vec_score
        FROM knowledge_chunks c
        LEFT JOIN ft  ON ft.id  = c.id
        LEFT JOIN vec ON vec.id = c.id
        WHERE (ft.id IS NOT NULL OR vec.id IS NOT NULL)
          AND ${scopeFilter} ${facultyFilter}
      )
      SELECT
        id, text, source_url, title, scope, faculty_id, topic_tags, publish_date,
        ft_score, vec_score
      FROM combined
      ORDER BY
        (ft_score * ${cfg.full_text_weight} + vec_score * ${cfg.vector_weight}) DESC
      LIMIT $${topK}
    `;
        const { rows } = await client.query(sql, params);
        if (rows.length === 0) {
            return { chunks: [], retrieval_confidence: 0, can_answer: false, is_cautious: false };
        }
        // Compute retrieval confidence per chunk with metadata bonus
        const chunks = rows.map((row) => {
            const ft = normalizeScore(Number(row.ft_score));
            const vec = normalizeScore(Number(row.vec_score));
            const metaBonus = computeMetadataBonus(row, queryText, row.source_url, row.title, topic_tags, scope, faculty_id, row.faculty_id);
            const confidence = parseFloat((ft * cfg.full_text_weight +
                vec * cfg.vector_weight +
                metaBonus * cfg.metadata_bonus_weight).toFixed(3));
            return {
                id: row.id,
                text: row.text,
                source_url: row.source_url,
                title: row.title,
                scope: row.scope,
                faculty_id: row.faculty_id,
                topic_tags: row.topic_tags ?? [],
                publish_date: row.publish_date,
                full_text_score: ft,
                vector_score: vec,
                metadata_bonus: metaBonus,
                retrieval_confidence: confidence,
            };
        });
        // Final rerank by confidence with canonicality-aware metadata bonus.
        chunks.sort((a, b) => b.retrieval_confidence - a.retrieval_confidence);
        // Overall retrieval confidence = highest scoring chunk
        const topChunks = chunks.slice(0, cfg.top_k);
        const best = Math.max(...topChunks.map(c => c.retrieval_confidence));
        return {
            chunks: topChunks,
            retrieval_confidence: best,
            can_answer: best >= CONFIDENCE_THRESHOLD_ANSWER,
            is_cautious: best >= CONFIDENCE_THRESHOLD_CAUTIOUS && best < CONFIDENCE_THRESHOLD_ANSWER,
        };
    }
    finally {
        client.release();
    }
}
function normalizeScore(raw) {
    // ts_rank returns 0..1, cosine similarity already normalized
    return Math.max(0, Math.min(1, raw));
}
function computeMetadataBonus(row, queryText, sourceUrl, title, queryTopics, queryScope, queryFaculty, rowFaculty) {
    let bonus = 0;
    const rowTags = row.topic_tags ?? [];
    const topicOverlap = queryTopics.filter(t => rowTags.includes(t)).length;
    if (topicOverlap > 0)
        bonus += 0.35;
    // Prefer chunks where URL/title lexical cues align with the query intent.
    const queryTokens = tokenize(queryText);
    const sourceTokens = tokenize(`${sourceUrl} ${title ?? ''}`);
    const lexicalOverlap = overlapRatio(queryTokens, sourceTokens);
    bonus += lexicalOverlap * 0.30;
    // Prefer likely canonical pages over deep or attachment URLs.
    const depth = pathDepth(sourceUrl);
    if (depth <= 1)
        bonus += 0.20;
    else if (depth <= 2)
        bonus += 0.12;
    else if (depth >= 4)
        bonus -= 0.08;
    if (isAttachmentUrl(sourceUrl)) {
        bonus -= 0.35;
    }
    else {
        bonus += 0.08;
    }
    if (queryScope === 'faculty' && queryFaculty && rowFaculty === queryFaculty) {
        bonus += 0.25;
    }
    return Math.max(0, Math.min(1, bonus));
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9ąćęłńóśźż\-_/ ]/g, ' ')
        .split(/[\s/_-]+/)
        .filter((t) => t.length > 2);
}
function overlapRatio(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    const bSet = new Set(b);
    const overlap = a.filter((t) => bSet.has(t)).length;
    return overlap / Math.max(a.length, 1);
}
function pathDepth(rawUrl) {
    try {
        const url = new URL(rawUrl);
        return url.pathname.split('/').filter(Boolean).length;
    }
    catch {
        return 99;
    }
}
function isAttachmentUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const p = url.pathname.toLowerCase();
        if (p.includes('/wp-content/uploads/'))
            return true;
        return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip)$/i.test(p);
    }
    catch {
        return false;
    }
}
