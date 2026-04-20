"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateSession = getOrCreateSession;
exports.updateSession = updateSession;
exports.canInheritContext = canInheritContext;
exports.canInheritContextCautious = canInheritContextCautious;
exports.getLastResolvedContext = getLastResolvedContext;
exports.resetSession = resetSession;
exports.getSessionMessages = getSessionMessages;
exports.saveMessage = saveMessage;
const index_1 = require("@sum/db/src/index");
async function getOrCreateSession(sessionId) {
    if (sessionId) {
        const { rows } = await index_1.pool.query('SELECT * FROM chat_sessions WHERE id = $1', [sessionId]);
        if (rows.length > 0)
            return rows[0];
    }
    const { rows } = await index_1.pool.query(`INSERT INTO chat_sessions DEFAULT VALUES RETURNING *`);
    return rows[0];
}
async function updateSession(sessionId, patch) {
    const fields = Object.keys(patch);
    if (fields.length === 0)
        return;
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => patch[f]);
    await index_1.pool.query(`UPDATE chat_sessions SET ${sets}, updated_at = NOW() WHERE id = $1`, [sessionId, ...values]);
}
function canInheritContext(session) {
    const conf = session.last_retrieval_confidence ?? 0;
    const answerConf = session.last_answer_confidence ?? 0;
    return conf >= 0.85 && answerConf >= 0.80;
}
function canInheritContextCautious(session) {
    const conf = session.last_retrieval_confidence ?? 0;
    return conf >= 0.70;
}
async function getLastResolvedContext(session) {
    return {
        faculty_id: session.last_resolved_faculty_id,
        scope: session.last_resolved_scope,
        topic_tags: session.last_resolved_topic_tags,
        source_urls: session.last_source_urls,
    };
}
async function resetSession(sessionId) {
    await index_1.pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
}
async function getSessionMessages(sessionId) {
    const { rows } = await index_1.pool.query(`SELECT id, role, content, response_type, resolved_scope, resolved_faculty_id,
            final_answer_confidence, retrieved_sources, created_at
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`, [sessionId]);
    return rows;
}
async function saveMessage(sessionId, data) {
    const { rows } = await index_1.pool.query(`INSERT INTO chat_messages (
      session_id, role, content, message_type, response_type,
      resolved_scope, resolved_faculty_id,
      query_classification_confidence, faculty_detection_confidence,
      retrieval_confidence, final_answer_confidence,
      retrieved_sources, followup_parent_message_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`, [
        sessionId,
        data.role,
        data.content,
        data.message_type ?? 'normal',
        data.response_type ?? null,
        data.resolved_scope ?? null,
        data.resolved_faculty_id ?? null,
        data.query_classification_confidence ?? null,
        data.faculty_detection_confidence ?? null,
        data.retrieval_confidence ?? null,
        data.final_answer_confidence ?? null,
        JSON.stringify(data.retrieved_sources ?? []),
        data.followup_parent_message_id ?? null,
    ]);
    return rows[0].id;
}
