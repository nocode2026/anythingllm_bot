"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const migrate_1 = require("@sum/db/src/migrate");
const chat_1 = require("./routes/chat");
const admin_1 = require("./routes/admin");
// Fail fast on model/dimension mismatch
(0, migrate_1.validateEmbeddingModel)();
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3100;
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
}));
app.use(express_1.default.json({ limit: '1mb' }));
// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
// Routes
app.use('/api/chat', chat_1.chatRouter);
app.use('/api/admin', admin_1.adminRouter);
// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// Error handler
app.use((err, _req, res, _next) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`[API] SUM Chatbot API listening on :${PORT}`);
});
exports.default = app;
