/**
 * configure-workspace.js – tworzy i konfiguruje workspace SUM w AnythingLLM
 *
 * Uruchomienie (jeden raz po pierwszym logowaniu):
 *   node configure-workspace.js
 *
 * Wymaga: ANYTHINGLLM_API_KEY i ANYTHINGLLM_BASE_URL w środowisku
 */

"use strict";

const axios = require("axios");

const ANYTHINGLLM_BASE = process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.ANYTHINGLLM_API_KEY || "";

if (!API_KEY) {
  console.error("Brak ANYTHINGLLM_API_KEY. Ustaw w .env lub export.");
  process.exit(1);
}

const api = axios.create({
  baseURL: `${ANYTHINGLLM_BASE}/api/v1`,
  headers: { Authorization: `Bearer ${API_KEY}` },
  timeout: 30000,
});

const WORKSPACE_CONFIG = {
  name: "SUM Student Bot",
  // Prompt systemowy – instrukcja dla bota
  openAiPrompt: `Jesteś asystentem studentów Śląskiego Uniwersytetu Medycznego w Katowicach (ŚUM).

Twoja rola:
- Odpowiadasz na pytania dotyczące portalu student.sum.edu.pl
- Pomagasz studentom znaleźć informacje o: stypendiach, harmonogramach zajęć i egzaminów, praktykach zawodowych, Erasmusie, wyjazdach studenckich, organizacjach studenckich, wsparciu psychologicznym, usługach IT, domach studenta, opłatach, regulaminach wydziałowych.
- Zawsze podajesz link do odpowiedniej strony na student.sum.edu.pl gdy to możliwe.

Zasady:
1. Odpowiadaj po polsku, chyba że student pyta po angielsku.
2. Jeśli pytanie dotyczy konkretnego wydziału, podaj informacje dla tego wydziału.
3. Jeśli nie znasz odpowiedzi z dostępnych dokumentów, powiedz wprost: "Nie mam tej informacji – skontaktuj się z właściwym dziekanatem" i podaj link do strony kontaktowej wydziału.
4. Nigdy nie zmyślaj dat, kwot ani warunków stypendialnych.
5. Dla pilnych spraw (wsparcie psychologiczne, Rzecznik Praw Studenta) zawsze podaj dane kontaktowe.
6. Na końcu każdej odpowiedzi dodaj sekcję "Możesz też zapytać:" z 2-3 krótkimi pytaniami pogłębiającymi dokładnie ten sam temat.
7. Pytania sugerowane mają być:
  - praktyczne i konkretne,
  - bez powtórzenia pytania użytkownika,
  - bez mieszania tematów niezwiązanych z bieżącą odpowiedzią.
8. Jeśli temat ma warianty (np. terminy, dokumenty, kontakt, warunki), sugerowane pytania powinny dotyczyć właśnie tych wariantów.

Wydziały ŚUM:
- WNMZ (Wydział Nauk Medycznych w Zabrzu): student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/
- WNMK (Wydział Nauk Medycznych w Katowicach): student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/
- WNOzK (Wydział Nauk o Zdrowiu w Katowicach): student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/
- WNFS (Wydział Nauk Farmaceutycznych w Sosnowcu): student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/
- WZPB (Wydział Zdrowia Publicznego w Bytomiu): student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/
- FBB (Filia w Bielsku-Białej): student.sum.edu.pl/filia-w-bielsku-bialej/`,

  // Ustawienia wyszukiwania wektorowego
  similarityThreshold: 0.25,  // niski próg = więcej wyników
  topN: 6,                     // ile fragmentów przekazać do LLM

  // Model LLM
  chatModel: "gpt-4o-mini",
  chatProvider: "openai",

  // Temperatura – niższa = mniej halucynacji
  openAiTemp: 0.3,
};

async function createOrGetWorkspace() {
  // Sprawdź czy workspace już istnieje
  try {
    const res = await api.get("/workspaces");
    const existing = res.data?.workspaces?.find(
      (w) => w.name === WORKSPACE_CONFIG.name
    );
    if (existing) {
      console.log(`Workspace już istnieje: "${existing.name}" (slug: ${existing.slug})`);
      return existing;
    }
  } catch (e) {
    // ignoruj – spróbujemy utworzyć
  }

  // Utwórz nowy workspace
  const res = await api.post("/workspace/new", {
    name: WORKSPACE_CONFIG.name,
  });
  const ws = res.data?.workspace;
  console.log(`✓ Workspace utworzony: "${ws.name}" (slug: ${ws.slug})`);
  return ws;
}

async function configureWorkspace(slug) {
  const res = await api.post(`/workspace/${slug}/update`, {
    openAiPrompt: WORKSPACE_CONFIG.openAiPrompt,
    similarityThreshold: WORKSPACE_CONFIG.similarityThreshold,
    topN: WORKSPACE_CONFIG.topN,
    chatModel: WORKSPACE_CONFIG.chatModel,
    chatProvider: WORKSPACE_CONFIG.chatProvider,
    openAiTemp: WORKSPACE_CONFIG.openAiTemp,
    queryRefusalResponse:
      "Nie mam tej informacji w swojej bazie wiedzy. Skontaktuj się z właściwym dziekanatem lub sprawdź stronę https://student.sum.edu.pl",
  });

  if (res.data?.workspace) {
    console.log("✓ Konfiguracja workspace zaktualizowana");
  } else {
    console.warn("⚠ Odpowiedź serwera bez potwierdzenia:", res.data);
  }
}

async function createEmbedWidget(slug) {
  try {
    const res = await api.post(`/workspace/${slug}/new-embed`, {
      usernameColor: "#1a5276",
      usernameBgColor: "#1a5276",
      assistantName: "Bot SUM",
      allowlist: ["student.sum.edu.pl", "*"],
      maxChatsPerDay: 50,
      maxChatsPerSession: 20,
    });

    const embed = res.data?.embed;
    if (embed) {
      console.log("\n✓ Widget embed utworzony!");
      console.log("  UUID:", embed.uuid);
      console.log("\n  === KOD DO WKLEJENIA NA STRONIE WORDPRESS ===");
      console.log(`
<script>
  (function(){
    var s=document.createElement("script");
    s.src="${ANYTHINGLLM_BASE}/embed/anythingllm-chat-widget.min.js";
    s.setAttribute("data-embed-id","${embed.uuid}");
    s.setAttribute("data-base-api-url","${ANYTHINGLLM_BASE}/api/embed");
    s.setAttribute("data-chat-icon","chatBubble");
    s.setAttribute("data-brand-image-url","https://sum.edu.pl/wp-content/themes/sum/images/logo-sum.png");
    s.setAttribute("data-assistant-name","Bot SUM");
    s.setAttribute("data-assistant-greeting","Cześć! Jestem botem Portalu Studenta ŚUM. W czym mogę Ci pomóc?");
    s.setAttribute("data-no-sponsor","true");
    s.setAttribute("data-position","bottom-right");
    s.setAttribute("data-button-color","#1a5276");
    document.body.appendChild(s);
  })();
</script>
`);
    }
  } catch (err) {
    console.warn("⚠ Nie udało się utworzyć embeda (może wymaga nowszej wersji):", err.message);
    console.log("  Utwórz embed ręcznie w panelu: Settings → Embeds → New Embed");
  }
}

async function main() {
  console.log("====================================================");
  console.log(" SUM AnythingLLM – Konfiguracja Workspace");
  console.log(" " + new Date().toISOString());
  console.log("====================================================");

  const ws = await createOrGetWorkspace();
  await configureWorkspace(ws.slug);
  await createEmbedWidget(ws.slug);

  console.log("\n====================================================");
  console.log(" Konfiguracja zakończona!");
  console.log(` Workspace slug: ${ws.slug}`);
  console.log(" Następny krok: uruchom sync-api.js i scrape-trigger.js");
  console.log("====================================================");
}

main().catch((err) => {
  console.error("Krytyczny błąd:", err.response?.data || err.message);
  process.exit(1);
});
