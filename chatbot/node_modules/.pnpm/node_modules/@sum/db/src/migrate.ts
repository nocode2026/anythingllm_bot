import fs from 'fs';
import path from 'path';
import { pool } from './index';

// Startup validation: embedding model dimension check
const EMBEDDING_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export function validateEmbeddingModel(): void {
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const configuredDim = parseInt(process.env.VECTOR_DIMENSION ?? '1536', 10);
  const expectedDim = EMBEDDING_DIMS[model];

  if (expectedDim === undefined) {
    console.warn(`[DB] Unknown embedding model "${model}" — cannot validate dimension.`);
    return;
  }
  if (expectedDim !== configuredDim) {
    console.error(
      `[DB] FATAL: OPENAI_EMBEDDING_MODEL="${model}" requires dimension ${expectedDim}, ` +
      `but VECTOR_DIMENSION=${configuredDim}. ` +
      `Update VECTOR_DIMENSION or change the model. Exiting.`
    );
    process.exit(1);
  }
}

async function runMigrations(): Promise<void> {
  validateEmbeddingModel();

  const client = await pool.connect();
  try {
    // Migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const schemaDir = path.join(__dirname, 'schema');
    const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE name = $1', [file]
      );
      if (rows.length > 0) {
        console.log(`[DB] Skipping migration ${file} (already run)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      console.log(`[DB] Running migration ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`[DB] Migration ${file} completed.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('[DB] All migrations applied.');
  } finally {
    client.release();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[DB] Migration failed:', err);
    process.exit(1);
  });
