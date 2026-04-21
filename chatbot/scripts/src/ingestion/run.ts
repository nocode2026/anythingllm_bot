import { loadRootEnv } from '@sum/db/src/loadEnv';
import { pool } from '@sum/db/src/index';
import { WordPressSource } from './wordpressSource';

loadRootEnv();
import { normalizeHtml } from './normalizer';
import { classify } from './classifier';
import { chunkText } from './chunker';
import { embedTexts } from './embedder';
import { v4 as uuidv4 } from 'uuid';

const MOCK_MODE = process.env.MOCK_MODE === 'true';
const BATCH_SIZE = parseInt(process.env.INGEST_BATCH_SIZE ?? '10', 10);
const WP_BASE = process.env.WP_BASE_URL ?? 'https://student.sum.edu.pl/wp-json/wp/v2';

// ── Mock data for dev without WP access ──────────────────────────────────────
const MOCK_PAGES = [
  {
    id: 1, slug: 'stypendium-rektora', link: 'https://student.sum.edu.pl/stypendium-rektora/',
    title: { rendered: 'Stypendium Rektora' }, type: 'page', date: '2024-10-01',
    content: { rendered: `<h2>Stypendium Rektora dla najlepszych studentów</h2>
      <p>Stypendium rektora może otrzymać student, który uzyskał wyróżniające wyniki w nauce, osiągnięcia naukowe, artystyczne lub sportowe we współzawodnictwie co najmniej na poziomie ogólnopolskim.</p>
      <p>Termin składania wniosków: do 15 października każdego roku.</p>
      <p>Wnioski składa się w dziekanacie właściwego wydziału.</p>
      <p>Wysokość stypendium: ustalana corocznie przez Rektora.</p>
      <p>Kontakt: stypendia@sum.edu.pl</p>` },
  },
  {
    id: 2, slug: 'stypendium-socjalne', link: 'https://student.sum.edu.pl/stypendium-socjalne/',
    title: { rendered: 'Stypendium Socjalne' }, type: 'page', date: '2024-10-01',
    content: { rendered: `<h2>Stypendium Socjalne</h2>
      <p>Stypendium socjalne przysługuje studentowi znajdującemu się w trudnej sytuacji materialnej.</p>
      <p>Próg dochodowy: 1294,40 zł netto na osobę w rodzinie miesięcznie.</p>
      <p>Wnioski: od 1 do 15 października (semestr zimowy), od 1 do 15 marca (semestr letni).</p>
      <p>Dokumenty: zaświadczenia o dochodach rodziny za poprzedni rok podatkowy.</p>` },
  },
  {
    id: 3,
    slug: 'dziekanat-wnmz',
    link: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/kontakt/',
    title: { rendered: 'Dziekanat WNMz Zabrze — kontakt' }, type: 'page', date: '2024-09-01',
    content: { rendered: `<h2>Dziekanat Wydziału Nauk Medycznych w Zabrzu</h2>
      <p>Adres: ul. 3 Maja 13/15, 41-800 Zabrze</p>
      <p>Telefon: 32 370 50 00</p>
      <p>Email: dziekanat.wnmz@sum.edu.pl</p>
      <p>Godziny przyjęć: poniedziałek–piątek 9:00–13:00</p>` },
  },
  {
    id: 4,
    slug: 'legitymacja',
    link: 'https://student.sum.edu.pl/uslugi-informatyczne-dla-studentow/',
    title: { rendered: 'Legitymacja studencka' }, type: 'page', date: '2024-09-01',
    content: { rendered: `<h2>Legitymacja studencka</h2>
      <p>Legitymację studencką wydaje dziekanat wydziału w ciągu 14 dni od złożenia wniosku.</p>
      <p>mLegitymacja: dostępna w aplikacji mObywatel po aktywacji w dziekanacie.</p>
      <p>Ważność legitymacji: potwierdza się na każdy semestr.</p>
      <p>Duplikat: 17 zł, złożenie wniosku w dziekanacie.</p>` },
  },
  {
    id: 5,
    slug: 'ubezpieczenie',
    link: 'https://student.sum.edu.pl/ubezpieczenie-studentow-i-doktorantow/',
    title: { rendered: 'Ubezpieczenie studentów' }, type: 'page', date: '2024-09-01',
    content: { rendered: `<h2>Ubezpieczenie studentów i doktorantów ŚUM</h2>
      <p>Studenci dzienni do 26 roku życia są objęci ubezpieczeniem zdrowotnym przez uczelnię.</p>
      <p>Dobrowolne ubezpieczenie NNW można wykupić przez uczelnię — formularz w dziekanacie.</p>
      <p>Ubezpieczenie podczas praktyk jest obowiązkowe i finansowane przez uczelnię.</p>
      
      <h3>Ochrona ubezpieczeniowa</h3>
      <p>Ubezpieczenie dostępne jest w kilku wariantach cenowych w zależności od zakresu ochrony.</p>
      
      <h4>Warianty</h4>
      <p><strong>Wariant A</strong> — Limity ochrony: NNW 26.000 zł, OC i OC praktykanta 50.000 zł</p>
      <p><strong>Wariant B</strong> — Limity ochrony: NNW 45.000 zł, OC i OC praktykanta 100.000 zł</p>
      <p><strong>Wariant I</strong> — NNW: 40 zł rocznie (70 zł dla innej kategorii)</p>
      <p><strong>Wariant II</strong> — NNW + OC w życiu prywatnym + OC praktykanta: 55 zł rocznie (93 zł dla innej kategorii)</p>
      <p><strong>Wariant II+</strong> — NNW + OC w życiu prywatnym + OC praktykanta + asysta prawna: 62 zł rocznie (100 zł dla innej kategorii)</p>
      
      <h4>Ubezpieczenie zdrowotne</h4>
      <p>Ubezpieczenie zdrowotne gwarantuje dostęp do świadczeń medycznych NFZ. Aby się rejestrować przez Uczelnię, student musi być zarejestrzszaowany w PESEL, być studentem i mieć ważną legitymację. Uczela zgłasza studentów zbiorowo do NFZ — o tym decyduje stan na dacie zgłoszenia. Wymagane dokumenty dostępne w dziekanacie.</p>
      
      <h4>Ubezpieczenie NNW (Następstw Nieszczęśliwych Wypadków)</h4>
      <p>Ubezpieczenie NNW dotyczy następstw nieszczęśliwych wypadków. Studenci mogą wybrać warianty A, B (limity ochrony) lub I, II, II+ (roczne składki). Sprawdź zakres ochrony i okres obowiązywania. Procedura zgłoszenia szkody dostępna w warunkach ubezpieczenia.</p>
      
      <h4>Ubezpieczenie OC (Odpowiedzialności Cywilnej)</h4>
      <p>Ubezpieczenie OC dotyczy odpowiedzialności cywilnej za szkody wyrządzone osobom trzecim. Dostępne są warianty z różnymi limitami (50.000 zł lub 100.000 zł) i zakresami ochrony, w tym OC praktykanta dla studentów uczestniczących w praktykach. OC praktykanta obowiązkowe dla niektórych kierunków studów.</p>
      
      <h4>Warunki i dokumenty</h4>
      <p>Ubezpieczenie nie jest obowiązkowe, jednak studenci mający przystąpić w bieżącym roku akademickim do praktyk mogą być zobowiązani do przedstawienia dowodu zawarcia ubezpieczenia NNW lub OC praktykanta.</p>
      <p>Formularze wniosków dostępne w dziekanacie właściwego wydziału. OWU NNW i OC zawierają pełne warunki ubezpieczenia, wyłączenia i procedury zgłaszania szkód.</p>
      <p>Biorąc pod uwagę atrakcyjny poziom cenowy oraz gwarantowany zakres ochrony ubezpieczeniowej zachęcamy do ubezpieczenia się już teraz.</p>` },
  },
];

type WPPage = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  modified?: string;
  type: string;
};

async function ingestPage(page: WPPage, jobId: string): Promise<number> {
  const text = normalizeHtml(page.content.rendered);
  if (text.length < 50) return 0;

  const title = page.title.rendered.replace(/<[^>]+>/g, '').trim();
  const cls = classify(page.link, title, text);
  const modifiedAt = page.modified ?? page.date;

  const existing = await pool.query(
    `SELECT id, metadata
     FROM knowledge_sources
     WHERE source_url = $1
     LIMIT 1`,
    [page.link]
  );

  if (existing.rows.length > 0) {
    const existingMetadata = existing.rows[0].metadata as { modified?: string } | null;
    if (existingMetadata?.modified === modifiedAt) {
      // Skip if unchanged, UNLESS it's the insurance page (which needs full re-index due to Elementor complexity)
      if (!page.link.includes('ubezpieczenie')) {
        await pool.query(
          `UPDATE ingestion_progress SET processed_pages = processed_pages + 1, last_cursor = $2 WHERE job_id = $1`,
          [jobId, page.slug]
        );
        console.log(`  ↷ ${page.slug} (unchanged)`);
        return 0;
      }
      // For insurance page: continue to re-index even if metadata says unchanged
    }
  }

  // Upsert knowledge_source
  const { rows: [src] } = await pool.query(
    `INSERT INTO knowledge_sources (source_type, source_url, title, scope, faculty_id, last_fetched_at, clean_text, metadata)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
     ON CONFLICT (source_url) DO UPDATE SET
       title = EXCLUDED.title, scope = EXCLUDED.scope, faculty_id = EXCLUDED.faculty_id,
       clean_text = EXCLUDED.clean_text, metadata = EXCLUDED.metadata, last_fetched_at = NOW()
     RETURNING id`,
    [
      page.type === 'post' ? 'wordpress_post' : 'wordpress_page',
      page.link, title, cls.scope, cls.faculty_id, text,
      JSON.stringify({ wp_id: page.id, slug: page.slug, published: page.date, modified: modifiedAt }),
    ]
  );

  const sourceId: string = src.id;

  // Chunk
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  // Embed
  const embeddings = await embedTexts(chunks.map(c => c.text));

  // Replace all chunks for source to avoid stale leftovers after content shrinkage.
  await pool.query(`DELETE FROM knowledge_chunks WHERE source_id = $1`, [sourceId]);

  // Insert chunks
  let inserted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const embLiteral = `[${embedding.join(',')}]`;

    await pool.query(
      `INSERT INTO knowledge_chunks (source_id, chunk_index, text, embedding, scope, faculty_id, topic_tags, source_url, title, publish_date, token_count)
       VALUES ($1,$2,$3,$4::vector,$5,$6,$7,$8,$9,$10,$11)`,
      [
        sourceId, chunk.chunk_index, chunk.text, embLiteral,
        cls.scope, cls.faculty_id, cls.topic_tags,
        page.link, title,
        page.date ? new Date(page.date) : null,
        chunk.token_count,
      ]
    );
    inserted++;
  }

  await pool.query(
    `UPDATE knowledge_sources SET last_indexed_at = NOW() WHERE id = $1`,
    [sourceId]
  );

  // Update job progress
  await pool.query(
    `UPDATE ingestion_progress SET processed_pages = processed_pages + 1, total_chunks = total_chunks + $2, last_cursor = $3 WHERE job_id = $1`,
    [jobId, inserted, page.slug]
  );

  return inserted;
}

async function main(): Promise<void> {
  console.log('[Ingest] Starting ingestion pipeline...');
  console.log(`[Ingest] Mode: ${MOCK_MODE ? 'MOCK' : 'LIVE (WordPress REST API)'}`);

  const jobId = uuidv4();
  await pool.query(
    `INSERT INTO ingestion_progress (job_id, status, started_at) VALUES ($1, 'running', NOW())`,
    [jobId]
  );

  try {
    let allPages: WPPage[] = [];

    if (MOCK_MODE) {
      allPages = MOCK_PAGES as WPPage[];
      console.log(`[Ingest] Using ${allPages.length} mock pages.`);
    } else {
      const wp = new WordPressSource(WP_BASE);
      const [pages, posts, placowki] = await Promise.all([
        wp.fetchPages(), wp.fetchPosts(), wp.fetchPlacowki(),
      ]);
      allPages = [...pages, ...posts, ...placowki];
      console.log(`[Ingest] Fetched ${allPages.length} items from WordPress.`);
    }

    await pool.query(
      `UPDATE ingestion_progress SET total_pages = $2 WHERE job_id = $1`,
      [jobId, allPages.length]
    );

    let totalChunks = 0;
    for (let i = 0; i < allPages.length; i += BATCH_SIZE) {
      const batch = allPages.slice(i, i + BATCH_SIZE);
      console.log(`[Ingest] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allPages.length / BATCH_SIZE)}`);

      for (const page of batch) {
        try {
          const n = await ingestPage(page, jobId);
          totalChunks += n;
          process.stdout.write(`  ✓ ${page.slug} (${n} chunks)\n`);
        } catch (err) {
          console.error(`  ✗ ${page.slug}:`, err);
        }
      }
    }

    await pool.query(
      `UPDATE ingestion_progress SET status='completed', completed_at=NOW(), total_chunks=$2 WHERE job_id=$1`,
      [jobId, totalChunks]
    );

    console.log(`\n[Ingest] Done! ${allPages.length} pages, ${totalChunks} chunks.`);
  } catch (err) {
    await pool.query(
      `UPDATE ingestion_progress SET status='failed', error_message=$2 WHERE job_id=$1`,
      [jobId, String(err)]
    );
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[Ingest] Fatal:', err);
  process.exit(1);
});
