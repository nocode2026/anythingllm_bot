import { pool } from '@sum/db/src/index';

export interface SessionState {
  id: string;
  faculty_context: string | null;
  last_resolved_faculty_id: string | null;
  last_resolved_scope: 'general' | 'faculty' | null;
  last_resolved_topic_tags: string[];
  last_source_urls: string[];
  last_answer_confidence: number | null;
  last_retrieval_confidence: number | null;
  last_message_type: 'normal' | 'follow-up' | 'clarification' | null;
  last_clarification_reason: string | null;
}

export async function getOrCreateSession(sessionId?: string): Promise<SessionState> {
  if (sessionId) {
    const { rows } = await pool.query<SessionState>(
      'SELECT * FROM chat_sessions WHERE id = $1', [sessionId]
    );
    if (rows.length > 0) return rows[0];
  }

  const { rows } = await pool.query<SessionState>(
    `INSERT INTO chat_sessions DEFAULT VALUES RETURNING *`
  );
  return rows[0];
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Omit<SessionState, 'id'>>
): Promise<void> {
  const fields = Object.keys(patch) as Array<keyof typeof patch>;
  if (fields.length === 0) return;

  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => patch[f]);

  await pool.query(
    `UPDATE chat_sessions SET ${sets}, updated_at = NOW() WHERE id = $1`,
    [sessionId, ...values]
  );
}

export function canInheritContext(session: SessionState): boolean {
  const conf = session.last_retrieval_confidence ?? 0;
  const answerConf = session.last_answer_confidence ?? 0;
  return conf >= 0.85 && answerConf >= 0.80;
}

export function canInheritContextCautious(session: SessionState): boolean {
  const conf = session.last_retrieval_confidence ?? 0;
  return conf >= 0.70;
}

export async function getLastResolvedContext(session: SessionState) {
  return {
    faculty_id: session.last_resolved_faculty_id,
    scope: session.last_resolved_scope,
    topic_tags: session.last_resolved_topic_tags,
    source_urls: session.last_source_urls,
  };
}

export async function resetSession(sessionId: string): Promise<void> {
  await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
}

export async function getSessionMessages(sessionId: string) {
  const { rows } = await pool.query(
    `SELECT id, role, content, response_type, resolved_scope, resolved_faculty_id,
            final_answer_confidence, retrieved_sources, created_at
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

export async function saveMessage(
  sessionId: string,
  data: {
    role: 'user' | 'assistant';
    content: string;
    message_type?: string;
    response_type?: string;
    resolved_scope?: string;
    resolved_faculty_id?: string | null;
    query_classification_confidence?: number;
    faculty_detection_confidence?: number;
    retrieval_confidence?: number;
    final_answer_confidence?: number;
    retrieved_sources?: unknown[];
    followup_parent_message_id?: string | null;
  }
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (
      session_id, role, content, message_type, response_type,
      resolved_scope, resolved_faculty_id,
      query_classification_confidence, faculty_detection_confidence,
      retrieval_confidence, final_answer_confidence,
      retrieved_sources, followup_parent_message_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`,
    [
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
    ]
  );
  return rows[0].id as string;
}
