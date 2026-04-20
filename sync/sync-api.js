/**
 * sync-api.js – pobiera treści z WordPress REST API student.sum.edu.pl
 * i importuje do workspace AnythingLLM jako dokumenty tekstowe.
 *
 * Uruchomienie:
 *   node sync-api.js
 *   (lub via cron: 0 3 * * * cd /opt/anythingllm/sync && node sync-api.js)
 *
 * Wymaga w .env (katalog nadrzędny):
 *   ANYTHINGLLM_API_KEY=...
 *   ANYTHINGLLM_BASE_URL=https://chat.sum.edu.pl
 */

"use strict";

const axios = require("axios");
const { NodeHtmlMarkdown } = require("node-html-markdown");
const fs = require("fs");
const path = require("path");

// ── Konfiguracja ──────────────────────────────────────────────────────────────
const WP_BASE = "https://student.sum.edu.pl/wp-json/wp/v2";
const ANYTHINGLLM_BASE = process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.ANYTHINGLLM_API_KEY || "";
const WORKSPACE_SLUG = "sum-student-bot";
const OUTPUT_DIR = path.join(__dirname, "output");
const ORG_UNIT_SLUGS = [
  "wydzial-nauk-medycznych-w-zabrzu",
  "wydzial-nauk-medycznych-w-katowicach",
  "wydzial-nauk-o-zdrowiu-w-katowicach",
  "wydzial-nauk-o-farmaceutycznych-w-sosnowcu",
  "wydzial-zdrowia-publicznego-w-bytomiu",
  "filia-w-bielsku-bialej",
];

if (!API_KEY) {
  console.error("Brak ANYTHINGLLM_API_KEY w środowisku. Ustaw w .env lub export.");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const nhm = new NodeHtmlMarkdown();

function htmlToText(html) {
  if (!html) return "";
  return nhm.translate(html)
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "") // usuń image links
    .replace(/!\[.*?\]\(.*?\)/g, "")            // usuń obrazy
    .replace(/\n{3,}/g, "\n\n")                 // max 2 puste linie
    .trim();
}

async function wpFetchAll(endpoint, extraParams = {}) {
  const items = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${WP_BASE}/${endpoint}`, {
      params: { per_page: 100, page, ...extraParams },
      timeout: 30000,
    });
    if (!res.data || res.data.length === 0) break;
    items.push(...res.data);
    const totalPages = parseInt(res.headers["x-wp-totalpages"] || "1", 10);
    if (page >= totalPages) break;
    page++;
  }
  return items;
}

async function uploadToAnythingLLM(filename, content) {
  const { default: FormData } = await import("form-data");
  const form = new FormData();
  const buffer = Buffer.from(content, "utf-8");
  form.append("file", buffer, {
    filename,
    contentType: "text/plain",
    knownLength: buffer.length,
  });

  const res = await axios.post(
    `${ANYTHINGLLM_BASE}/api/v1/document/upload`,
    form,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...form.getHeaders(),
      },
      timeout: 60000,
    }
  );
  return res.data;
}

async function addDocToWorkspace(docPath) {
  await axios.post(
    `${ANYTHINGLLM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}/update-embeddings`,
    { adds: [docPath], deletes: [] },
    {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: 120000,
    }
  );
}

// ── Formattery dokumentów ─────────────────────────────────────────────────────
function formatPost(post) {
  const title = post.title?.rendered || "(bez tytułu)";
  const content = htmlToText(post.content?.rendered || "");
  const date = post.date ? post.date.substring(0, 10) : "";
  const link = post.link || "";
  const categories = (post._embedded?.["wp:term"]?.[0] || [])
    .map((c) => c.name)
    .join(", ");

  return [
    `# ${title}`,
    date ? `Data: ${date}` : "",
    categories ? `Kategoria: ${categories}` : "",
    link ? `Link: ${link}` : "",
    "",
    content,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPage(page) {
  const title = page.title?.rendered || "(bez tytułu)";
  const content = htmlToText(page.content?.rendered || "");
  const link = page.link || "";

  return [
    `# ${title}`,
    link ? `Link: ${link}` : "",
    "",
    content,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPlacowka(p) {
  const title = p.title?.rendered || "";
  const content = htmlToText(p.content?.rendered || "");
  const link = p.link || "";
  const kierunki = (p._embedded?.["wp:term"]?.find((g) =>
    g.some((t) => t.taxonomy === "kierunek")
  ) || [])
    .map((t) => t.name)
    .join(", ");
  const wojewodztwa = (p._embedded?.["wp:term"]?.find((g) =>
    g.some((t) => t.taxonomy === "wojewodztwo")
  ) || [])
    .map((t) => t.name)
    .join(", ");

  return [
    `# Placówka praktyk: ${title}`,
    kierunki ? `Kierunek: ${kierunki}` : "",
    wojewodztwa ? `Województwo: ${wojewodztwa}` : "",
    link ? `Link: ${link}` : "",
    "",
    content,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Główna logika ─────────────────────────────────────────────────────────────
async function syncSection(label, endpoint, formatter, slugPrefix, extraParams = {}) {
  console.log(`\n[${label}] Pobieram z API...`);
  const items = await wpFetchAll(endpoint, { _embed: true, ...extraParams });
  console.log(`  Znaleziono: ${items.length} elementów`);

  let ok = 0;
  let fail = 0;

  for (const item of items) {
    const id = item.id;
    const slug = item.slug || String(id);
    const filename = `${slugPrefix}-${slug}.txt`;
    const content = formatter(item);

    // Pomiń puste dokumenty (Elementor renderuje JS-side – strony mogą być puste via API)
    const textLength = content.replace(/^#.*$/gm, "").trim().length;
    if (textLength < 50) {
      console.log(`  ⚠ Pomijam (pusta treść): ${filename}`);
      continue;
    }

    try {
      const result = await uploadToAnythingLLM(filename, content);
      const docPath = result?.documents?.[0]?.location;
      if (docPath) {
        await addDocToWorkspace(docPath);
        ok++;
        console.log(`  ✓ ${filename}`);
      } else {
        fail++;
        console.log(`  ✗ Brak lokalizacji dokumentu: ${filename}`);
      }
    } catch (err) {
      fail++;
      console.error(`  ✗ Błąd dla ${filename}: ${err.message}`);
    }

    // Krótki delay – nie przeciążaj serwera
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`  Gotowe: ${ok} OK, ${fail} błędów`);
}

async function reportOrgUnits() {
  const pages = await wpFetchAll("pages", {
    status: "publish",
    slug: ORG_UNIT_SLUGS.join(","),
    _fields: "slug,title,link",
  });

  const slugSet = new Set(pages.map((p) => p.slug));
  const missing = ORG_UNIT_SLUGS.filter((slug) => !slugSet.has(slug));

  console.log("\n[WERYFIKACJA STRUKTURY UCZELNI]");
  console.log(`  Wydziały + filia znalezione w pages: ${pages.length}/${ORG_UNIT_SLUGS.length}`);
  pages.forEach((p) => {
    const title = p.title?.rendered || p.slug;
    console.log(`  ✓ ${title} (${p.link || "brak linku"})`);
  });
  if (missing.length) {
    console.log(`  ⚠ Brakujące slugi: ${missing.join(", ")}`);
  }
}

async function main() {
  console.log("====================================================");
  console.log(" SUM AnythingLLM – Sync WordPress API");
  console.log(" " + new Date().toISOString());
  console.log("====================================================");

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  // 1. Posty (aktualności, komunikaty)
  await syncSection(
    "POSTY",
    "posts",
    formatPost,
    "post",
    { status: "publish" }
  );

  // 2. Strony (pages) – WARNING: Elementor często zwraca puste, ale próbujemy
  await syncSection(
    "STRONY (pages)",
    "pages",
    formatPage,
    "page",
    { status: "publish" }
  );

  // 3. Placówki praktyk (custom post type – tylko w API!)
  await syncSection(
    "PLACÓWKI PRAKTYK",
    "placowki",
    formatPlacowka,
    "placowka",
    { status: "publish" }
  );

  await reportOrgUnits();

  console.log("\n====================================================");
  console.log(" Synchronizacja zakończona!");
  console.log("====================================================");
}

main().catch((err) => {
  console.error("Krytyczny błąd:", err);
  process.exit(1);
});
