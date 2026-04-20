import 'dotenv/config';
import { pool } from '@sum/db/src/index';

const CORE_TOPICS = [
  'stypendium',
  'harmonogram',
  'egzamin',
  'praktyki',
  'dziekanat',
  'kontakt',
  'legitymacja',
  'ubezpieczenie',
  'regulamin',
  'oplaty',
];

async function main(): Promise<void> {
  const sourcesByFaculty = await pool.query(
    `SELECT scope, COALESCE(faculty_id, 'general') AS faculty_id, COUNT(*)::int AS source_count
     FROM knowledge_sources
     GROUP BY 1, 2
     ORDER BY 1, 2`
  );

  const chunksByTopic = await pool.query(
    `SELECT COALESCE(faculty_id, 'general') AS faculty_id,
            topic,
            COUNT(*)::int AS chunk_count
     FROM (
       SELECT faculty_id, unnest(topic_tags) AS topic
       FROM knowledge_chunks
     ) tagged
     GROUP BY 1, 2
     ORDER BY 1, 2`
  );

  const filteredTopics = chunksByTopic.rows.filter((row: { topic: string }) =>
    CORE_TOPICS.includes(row.topic)
  );

  console.log('=== SOURCES BY FACULTY ===');
  console.log(JSON.stringify(sourcesByFaculty.rows, null, 2));
  console.log('');
  console.log('=== CORE TOPICS BY FACULTY ===');
  console.log(JSON.stringify(filteredTopics, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });