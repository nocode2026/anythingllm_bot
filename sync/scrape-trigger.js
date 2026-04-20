/**
 * scrape-trigger.js – wywołuje wbudowany scraper AnythingLLM
 * aby przescrapować student.sum.edu.pl (wszystkie strony Elementor).
 *
 * Uruchomienie:
 *   node scrape-trigger.js
 *   (lub via cron: 0 2 1 * * cd /opt/anythingllm/sync && node scrape-trigger.js)
 *
 * UWAGA: Scraping 162 stron zajmuje ~10-30 minut.
 */

"use strict";

const axios = require("axios");

const ANYTHINGLLM_BASE = process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.ANYTHINGLLM_API_KEY || "";
const WORKSPACE_SLUG = "sum-student-bot";

const WP_BASE = "https://student.sum.edu.pl/wp-json/wp/v2";

async function fetchAllPageLinks() {
  const links = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${WP_BASE}/pages`, {
      params: { per_page: 100, page, _fields: "link,status", status: "publish" },
      timeout: 30000,
    });
    if (!res.data.length) break;
    res.data.forEach((p) => { if (p.link) links.push(p.link); });
    if (res.data.length < 100) break;
    page++;
  }
  return links;
}

async function scrapeAndEmbed(url) {
  try {
    // Krok 1 – scrape URL → dokument w AnythingLLM
    const scrapeRes = await axios.post(
      `${ANYTHINGLLM_BASE}/api/v1/document/upload-link`,
      { link: url },
      {
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        timeout: 120000,
      }
    );

    const docPath = scrapeRes.data?.documents?.[0]?.location;
    if (!docPath) {
      console.log(`  ⚠ Brak dokumentu po scrape: ${url}`);
      return;
    }

    // Krok 2 – dodaj dokument do workspace
    await axios.post(
      `${ANYTHINGLLM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}/update-embeddings`,
      { adds: [docPath], deletes: [] },
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        timeout: 120000,
      }
    );

    console.log(`  ✓ ${url}`);
  } catch (err) {
    const status = err.response?.status;
    console.error(`  ✗ [${status || "ERR"}] ${url}: ${err.message}`);
  }
}

async function main() {
  if (!API_KEY) {
    console.error("Brak ANYTHINGLLM_API_KEY. Ustaw w .env lub export.");
    process.exit(1);
  }

  const SEED_URLS = await fetchAllPageLinks();

  console.log("====================================================");
  console.log(" SUM AnythingLLM – Web Scrape");
  console.log(" " + new Date().toISOString());
  console.log(`  Stron do scrapowania: ${SEED_URLS.length}`);
  console.log("====================================================");

  for (const url of SEED_URLS) {
    process.stdout.write(`Scraping: ${url}\n`);
    await scrapeAndEmbed(url);
    // Delay między requestami – nie przeciążaj serwera SUM
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n====================================================");
  console.log(" Scraping zakończony!");
  console.log("====================================================");
}

main().catch((err) => {
  console.error("Krytyczny błąd:", err);
  process.exit(1);
});
