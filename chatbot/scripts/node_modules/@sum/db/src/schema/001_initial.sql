-- SUM Chatbot — pełny schemat bazy danych
-- Migracja v1.0.0

-- ── Ext ── 
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE TEXT SEARCH CONFIGURATION polish_unaccent (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION polish_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

-- ── knowledge_sources ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN ('wordpress_post','wordpress_page','html_crawl','faq_api')),
  source_url      TEXT NOT NULL,
  title           TEXT,
  scope           TEXT NOT NULL CHECK (scope IN ('general','faculty')),
  faculty_id      TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_indexed_at TIMESTAMPTZ,
  raw_html        TEXT,
  clean_text      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_scope ON knowledge_sources(scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_faculty ON knowledge_sources(faculty_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_url ON knowledge_sources(source_url);

-- ── knowledge_chunks ───────────────────────────────────────────────────────────
-- VECTOR_DIM placeholder replaced at migration time based on OPENAI_EMBEDDING_MODEL
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  text            TEXT NOT NULL,
  embedding       vector(1536),          -- text-embedding-3-small default
  ts_vector       TSVECTOR,
  scope           TEXT NOT NULL CHECK (scope IN ('general','faculty')),
  faculty_id      TEXT,
  topic_tags      TEXT[] NOT NULL DEFAULT '{}',
  source_url      TEXT NOT NULL,
  title           TEXT,
  publish_date    TIMESTAMPTZ,
  token_count     INTEGER,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_scope ON knowledge_chunks(scope);
CREATE INDEX IF NOT EXISTS idx_chunks_faculty ON knowledge_chunks(faculty_id);
CREATE INDEX IF NOT EXISTS idx_chunks_topic_tags ON knowledge_chunks USING GIN(topic_tags);
CREATE INDEX IF NOT EXISTS idx_chunks_ts_vector ON knowledge_chunks USING GIN(ts_vector);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_chunks_publish_date ON knowledge_chunks(publish_date DESC);

-- Auto-update ts_vector on insert/update
CREATE OR REPLACE FUNCTION update_chunk_ts_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ts_vector := to_tsvector('polish_unaccent', coalesce(NEW.title,'') || ' ' || NEW.text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_chunk_ts_vector ON knowledge_chunks;
CREATE TRIGGER trig_chunk_ts_vector
  BEFORE INSERT OR UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_chunk_ts_vector();

-- ── ingestion_progress ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  total_pages     INTEGER DEFAULT 0,
  processed_pages INTEGER DEFAULT 0,
  total_chunks    INTEGER DEFAULT 0,
  last_cursor     TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- ── chat_sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_context             TEXT,
  last_resolved_faculty_id    TEXT,
  last_resolved_scope         TEXT CHECK (last_resolved_scope IN ('general','faculty')),
  last_resolved_topic_tags    TEXT[] NOT NULL DEFAULT '{}',
  last_source_urls            TEXT[] NOT NULL DEFAULT '{}',
  last_answer_confidence      FLOAT,
  last_retrieval_confidence   FLOAT,
  last_message_type           TEXT CHECK (last_message_type IN ('normal','follow-up','clarification')),
  last_clarification_reason   TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── chat_messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role                            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content                         TEXT NOT NULL,
  message_type                    TEXT CHECK (message_type IN ('normal','follow-up','clarification')),
  response_type                   TEXT CHECK (response_type IN ('answer','fallback','clarification','refusal')),
  resolved_scope                  TEXT CHECK (resolved_scope IN ('general','faculty')),
  resolved_faculty_id             TEXT,
  query_classification_confidence FLOAT,
  faculty_detection_confidence    FLOAT,
  retrieval_confidence            FLOAT,
  final_answer_confidence         FLOAT,
  retrieved_sources               JSONB NOT NULL DEFAULT '[]',
  followup_parent_message_id      UUID REFERENCES chat_messages(id),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_response_type ON chat_messages(response_type);
CREATE INDEX IF NOT EXISTS idx_messages_low_confidence 
  ON chat_messages(final_answer_confidence) 
  WHERE final_answer_confidence IS NOT NULL;

-- ── analytics_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID REFERENCES chat_sessions(id),
  message_id        UUID REFERENCES chat_messages(id),
  event_type        TEXT NOT NULL,
  intent            TEXT,
  faculty_context   TEXT,
  retrieval_confidence FLOAT,
  final_answer_confidence FLOAT,
  latency_ms        INTEGER,
  fallback_reason   TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
