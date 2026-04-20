"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
const index_1 = require("@sum/db/src/index");
async function logEvent(event) {
    try {
        await index_1.pool.query(`INSERT INTO analytics_events (
        session_id, message_id, event_type, intent, faculty_context,
        retrieval_confidence, final_answer_confidence, latency_ms,
        fallback_reason, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
            event.session_id ?? null,
            event.message_id ?? null,
            event.event_type,
            event.intent ?? null,
            event.faculty_context ?? null,
            event.retrieval_confidence ?? null,
            event.final_answer_confidence ?? null,
            event.latency_ms ?? null,
            event.fallback_reason ?? null,
            JSON.stringify(event.metadata ?? {}),
        ]);
    }
    catch (err) {
        // Analytics must never crash the main flow
        console.error('[Analytics] Failed to log event:', err);
    }
}
