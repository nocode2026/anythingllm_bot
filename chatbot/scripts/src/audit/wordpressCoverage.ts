import { loadRootEnv } from '@sum/db/src/loadEnv';
import { pool } from '@sum/db/src/index';
import { WordPressSource } from '../ingestion/wordpressSource';

loadRootEnv();

const WP_BASE = process.env.WP_BASE_URL ?? 'https://student.sum.edu.pl/wp-json/wp/v2';

async function main(): Promise<void> {
  const wp = new WordPressSource(WP_BASE);
  const [pages, posts, placowki] = await Promise.all([
    wp.fetchPages(),
    wp.fetchPosts(),
    wp.fetchPlacowki(),
  ]);

  const wpItems = [...pages, ...posts, ...placowki];
  const wpUrls = new Set(wpItems.map((p) => p.link));

  const dbSources = await pool.query(
    `SELECT id, source_url, source_type FROM knowledge_sources WHERE source_type IN ('wordpress_page', 'wordpress_post')`
  );

  const dbChunks = await pool.query(
    `SELECT source_url, COUNT(*)::int AS chunk_count
     FROM knowledge_chunks
     GROUP BY source_url`
  );

  const chunkByUrl = new Map<string, number>(
    dbChunks.rows.map((r: { source_url: string; chunk_count: number }) => [r.source_url, r.chunk_count])
  );

  const dbUrls = new Set<string>(dbSources.rows.map((r: { source_url: string }) => r.source_url));

  const missingInDb = [...wpUrls].filter((url) => !dbUrls.has(url));
  const extraInDb = [...dbUrls].filter((url) => !wpUrls.has(url));
  const zeroChunks = [...wpUrls].filter((url) => (chunkByUrl.get(url) ?? 0) === 0);

  const coveragePct = wpUrls.size > 0
    ? ((wpUrls.size - missingInDb.length) / wpUrls.size) * 100
    : 0;

  console.log('=== WORDPRESS COVERAGE AUDIT ===');
  console.log(`WP total items: ${wpUrls.size}`);
  console.log(`DB mapped sources: ${dbUrls.size}`);
  console.log(`Coverage mapped: ${coveragePct.toFixed(2)}%`);
  console.log(`Missing in DB: ${missingInDb.length}`);
  console.log(`Extra in DB: ${extraInDb.length}`);
  console.log(`URLs with 0 chunks: ${zeroChunks.length}`);

  if (missingInDb.length > 0) {
    console.log('\n-- Missing URLs (first 30) --');
    for (const url of missingInDb.slice(0, 30)) {
      console.log(url);
    }
  }

  if (zeroChunks.length > 0) {
    console.log('\n-- 0-chunk URLs (first 30) --');
    for (const url of zeroChunks.slice(0, 30)) {
      console.log(url);
    }
  }

  if (extraInDb.length > 0) {
    console.log('\n-- Extra DB URLs (first 30) --');
    for (const url of extraInDb.slice(0, 30)) {
      console.log(url);
    }
  }
}

main()
  .catch((err) => {
    console.error('[Audit] Fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
