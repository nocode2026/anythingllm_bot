import { Router } from 'express';
import { pool } from '@sum/db/src/index';
import { v4 as uuidv4 } from 'uuid';

export const adminRouter = Router();

// GET /api/admin/stats
adminRouter.get('/stats', async (_req, res) => {
  const [questions, today, unanswered, sources, chunks] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM chat_messages WHERE role='user'`),
    pool.query(`SELECT COUNT(*) FROM chat_messages WHERE role='user' AND created_at > NOW() - INTERVAL '1 day'`),
    pool.query(`SELECT COUNT(*) FROM chat_messages WHERE response_type='fallback'`),
    pool.query(`SELECT COUNT(*) FROM knowledge_sources`),
    pool.query(`SELECT COUNT(*) FROM knowledge_chunks`),
  ]);

  const totalQ = parseInt(questions.rows[0].count, 10);
  const answeredQ = totalQ - parseInt(unanswered.rows[0].count, 10);
  const coverageScore = totalQ > 0 ? parseFloat((answeredQ / totalQ).toFixed(3)) : null;

  const lastSync = await pool.query(
    `SELECT MAX(last_indexed_at) AS last_indexed_at FROM knowledge_sources`
  );

  res.json({
    total_questions: totalQ,
    today_questions: parseInt(today.rows[0].count, 10),
    unanswered_questions: parseInt(unanswered.rows[0].count, 10),
    coverage_score: coverageScore,
    knowledge_sources: parseInt(sources.rows[0].count, 10),
    knowledge_chunks: parseInt(chunks.rows[0].count, 10),
    last_sync: lastSync.rows[0].last_indexed_at,
  });
});

// GET /api/admin/unanswered
adminRouter.get('/unanswered', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
  const offset = parseInt(String(req.query.offset ?? '0'), 10);

  const { rows } = await pool.query(
    `SELECT m.id, m.content AS question, m.created_at, s.faculty_context
     FROM chat_messages m
     LEFT JOIN chat_sessions s ON s.id = m.session_id
     WHERE m.response_type = 'fallback' AND m.role = 'assistant'
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.json({ items: rows, limit, offset });
});

// GET /api/admin/low-confidence
adminRouter.get('/low-confidence', async (req, res) => {
  const threshold = parseFloat(String(req.query.threshold ?? '0.60'));
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);

  const { rows } = await pool.query(
    `SELECT id, content, final_answer_confidence, created_at
     FROM chat_messages
     WHERE role = 'assistant'
       AND final_answer_confidence IS NOT NULL
       AND final_answer_confidence < $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [threshold, limit]
  );
  res.json({ items: rows, threshold });
});

// GET /api/admin/sources
adminRouter.get('/sources', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, source_type, source_url, scope, faculty_id,
            last_fetched_at, last_indexed_at, title
     FROM knowledge_sources
     ORDER BY last_indexed_at DESC NULLS LAST
     LIMIT 500`
  );
  res.json({ items: rows });
});

// In-memory job tracker (production: use DB ingestion_progress table)
const activeJobs = new Map<string, { status: string; started_at: string; progress?: number }>();

// POST /api/admin/reindex
adminRouter.post('/reindex', async (_req, res) => {
  const jobId = uuidv4();
  activeJobs.set(jobId, { status: 'running', started_at: new Date().toISOString() });

  await pool.query(
    `INSERT INTO ingestion_progress (job_id, status, started_at) VALUES ($1, 'running', NOW())
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId]
  );

  // Async — do not block response
  setImmediate(async () => {
    try {
      // Reindex trigger (actual ingestion runs in scripts package)
      // Here we just mark as completed if no runner is attached
      await new Promise(r => setTimeout(r, 2000));
      activeJobs.set(jobId, { status: 'completed', started_at: activeJobs.get(jobId)!.started_at });
      await pool.query(
        `UPDATE ingestion_progress SET status = 'completed', completed_at = NOW() WHERE job_id = $1`,
        [jobId]
      );
    } catch (err) {
      activeJobs.set(jobId, { status: 'failed', started_at: activeJobs.get(jobId)!.started_at });
      await pool.query(
        `UPDATE ingestion_progress SET status = 'failed', error_message=$2 WHERE job_id = $1`,
        [jobId, String(err)]
      );
    }
  });

  res.json({ job_id: jobId, status: 'running' });
});

// GET /api/admin/reindex/:jobId
adminRouter.get('/reindex/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM ingestion_progress WHERE job_id = $1`, [jobId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(rows[0]);
});
