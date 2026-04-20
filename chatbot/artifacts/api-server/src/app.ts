import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { validateEmbeddingModel } from '@sum/db/src/migrate';
import { chatRouter } from './routes/chat';
import { adminRouter } from './routes/admin';

// Fail fast on model/dimension mismatch
validateEmbeddingModel();

const app = express();
const PORT = process.env.PORT ?? 3100;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Routes
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[API] SUM Chatbot API listening on :${PORT}`);
});

export default app;
