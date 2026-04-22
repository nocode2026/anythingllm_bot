export interface ActionButton {
  label: string;
  kind: 'link' | 'query';
  url?: string;
  query?: string;
}

interface WPItem {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  type: string;
}

const WP_BASE_URL = process.env.WP_BASE_URL ?? 'https://student.sum.edu.pl/wp-json/wp/v2';
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;

const FACULTY_URL_PATTERNS: Record<string, RegExp> = {
  wnmz: /wydzial-nauk-medycznych-w-zabrzu/i,
  wnmk: /wydzial-nauk-medycznych-w-katowicach/i,
  wnozk: /wydzial-nauk-o-zdrowiu-w-katowicach/i,
  wnf: /wydzial-nauk-farmaceutycznych-w-sosnowcu|wydzial-nauk-o-farmaceutycznych-w-sosnowcu/i,
  wzpb: /wydzial-zdrowia-publicznego-w-bytomiu/i,
  fbb: /filia-w-bielsku-bialej/i,
};

const FACULTY_LABELS: Record<string, string> = {
  wnmz: 'WNMZ',
  wnmk: 'WNMK',
  wnozk: 'WNoZK',
  wnf: 'WNF',
  wzpb: 'WZPB',
  fbb: 'FBB',
};

const FACULTY_TOPIC_FALLBACK_URLS: Record<string, Record<string, string>> = {
  wnmz: {
    harmonogram: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-zajec/',
    egzamin: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/kontakt/',
  },
  wnmk: {
    harmonogram: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-zajec/',
    egzamin: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/kontakt/',
  },
  wnozk: {
    harmonogram: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy/',
    egzamin: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/kontakt/',
  },
  wnf: {
    harmonogram: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-zajec/',
    egzamin: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/kontakt/',
  },
  wzpb: {
    harmonogram: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-zajec/',
    egzamin: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/kontakt/',
  },
  fbb: {
    harmonogram: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy/',
    egzamin: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy-egzaminow/',
    sylabus: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/sylabusy/',
    dziekanat: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/kontakt/',
  },
};

const GENERAL_TOPIC_MATCHERS: Record<string, RegExp[]> = {
  stypendium: [
    /stypendium/i,
    /zapomog/i,
    /swiadczen/i,
    /kpo/i,
  ],
  ubezpieczenie: [/ubezpieczen/i],
  legitymacja: [/legitymacj/i, /uslugi-informatyczne/i],
  erasmus: [/erasmus/i, /wyjazdy-studentow/i],
  praktyki: [/praktyk/i],
  akademik: [/domy-studenta|akademik|dom-studenta/i],
  oplaty: [/oplat/i],
  wsparcie: [/wsparcie-psychologiczne|psychologiczn/i],
  kontakt: [/kontakt/i],
};

const FACULTY_TOPIC_MATCHERS: Record<string, RegExp[]> = {
  harmonogram: [/harmonogram/i],
  sylabus: [/sylabus|syllabus/i],
  egzamin: [/egzamin/i],
  praktyki: [/praktyk/i],
  dziekanat: [/kontakt|dziekanat|sekretariat/i],
  kontakt: [/kontakt/i],
  regulamin: [/regulamin/i],
  dokumenty: [/dokumenty-do-pobrania|dokument/i],
};

let cache: { fetchedAt: number; items: WPItem[] } | null = null;

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function isCopyLike(item: WPItem): boolean {
  const raw = `${item.slug} ${stripHtml(item.title.rendered)}`.toLowerCase();
  return /\b(kopia|copy)\b/.test(raw) || /\(kopia\)/i.test(raw);
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/\s*\((kopia|copy)\)\s*/gi, ' ')
    .replace(/\b(kopia|copy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

async function fetchJsonWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAll(endpoint: string): Promise<WPItem[]> {
  const items: WPItem[] = [];
  let page = 1;

  while (true) {
    const url = `${WP_BASE_URL}/${endpoint}?per_page=50&page=${page}&status=publish&_fields=id,slug,link,title,type`;
    const res = await fetchJsonWithTimeout(url);
    if (!res.ok) {
      throw new Error(`WP fetch failed for ${endpoint} page ${page}: ${res.status}`);
    }

    const batch = await res.json() as WPItem[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);

    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1');
    if (page >= totalPages) break;
    page += 1;
  }

  return items;
}

async function getWpCatalog(): Promise<WPItem[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  try {
    const [pages, posts, placowki] = await Promise.all([
      fetchAll('pages'),
      fetchAll('posts'),
      fetchAll('placowki'),
    ]);

    const items = [...pages, ...posts, ...placowki];
    cache = { fetchedAt: Date.now(), items };
    return items;
  } catch (error) {
    console.warn('[ActionButtons] WP catalog fetch failed, using fallback.', error);
    if (cache?.items?.length) {
      return cache.items;
    }
    return [];
  }
}

function dedupe(buttons: ActionButton[]): ActionButton[] {
  const seen = new Set<string>();
  return buttons.filter((button) => {
    const key = button.kind === 'link'
      ? `link:${normalizeUrl(button.url ?? '')}`
      : `query:${(button.query ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toButton(item: WPItem): ActionButton {
  const label = cleanLabel(stripHtml(item.title.rendered) || item.slug);
  return {
    label,
    kind: 'link',
    url: normalizeUrl(item.link),
  };
}

function rankGeneralTopicItems(topic: string, items: WPItem[]): WPItem[] {
  const matchers = GENERAL_TOPIC_MATCHERS[topic] ?? [];
  return items
    .filter((item) => !isCopyLike(item))
    .filter((item) => {
      const haystack = `${item.slug} ${item.link} ${stripHtml(item.title.rendered)}`;
      return matchers.some((rx) => rx.test(haystack));
    })
    .sort((a, b) => {
      const aTitle = stripHtml(a.title.rendered);
      const bTitle = stripHtml(b.title.rendered);
      const aScore = Number(/stypendium|ministra|socjalne|rektora|zapomogi|ubezpieczenie|legitymacj|erasmus|praktyki|domy studenta/i.test(aTitle));
      const bScore = Number(/stypendium|ministra|socjalne|rektora|zapomogi|ubezpieczenie|legitymacj|erasmus|praktyki|domy studenta/i.test(bTitle));
      return bScore - aScore;
    });
}

function rankFacultyItems(facultyId: string, topic: string, items: WPItem[]): WPItem[] {
  const facultyPattern = FACULTY_URL_PATTERNS[facultyId];
  const topicMatchers = FACULTY_TOPIC_MATCHERS[topic] ?? [];

  return items
    .filter((item) => !isCopyLike(item))
    .filter((item) => facultyPattern?.test(item.link))
    .filter((item) => {
      const haystack = `${item.slug} ${item.link} ${stripHtml(item.title.rendered)}`;
      return topicMatchers.some((rx) => rx.test(haystack));
    })
    .sort((a, b) => {
      const aTitle = stripHtml(a.title.rendered);
      const bTitle = stripHtml(b.title.rendered);
      const aExact = Number(topic === 'harmonogram' ? /harmonogramy zajęć|harmonogramy zajec/i.test(aTitle) : false)
        + Number(topic === 'sylabus' ? /sylabus|syllabus/i.test(aTitle) : false)
        + Number(topic === 'egzamin' ? /harmonogramy egzaminów|harmonogramy egzaminow/i.test(aTitle) : false)
        + Number(topic === 'dziekanat' ? /kontakt|dziekanat/i.test(aTitle) : false);
      const bExact = Number(topic === 'harmonogram' ? /harmonogramy zajęć|harmonogramy zajec/i.test(bTitle) : false)
        + Number(topic === 'sylabus' ? /sylabus|syllabus/i.test(bTitle) : false)
        + Number(topic === 'egzamin' ? /harmonogramy egzaminów|harmonogramy egzaminow/i.test(bTitle) : false)
        + Number(topic === 'dziekanat' ? /kontakt|dziekanat/i.test(bTitle) : false);
      return bExact - aExact;
    });
}

function labelFacultyItem(facultyId: string, topic: string, item: WPItem): ActionButton {
  const raw = cleanLabel(stripHtml(item.title.rendered));
  if (/kontakt/i.test(raw) && (topic === 'dziekanat' || topic === 'kontakt')) {
    return {
      label: `${topic === 'dziekanat' ? 'Dziekanat' : 'Kontakt'} ${FACULTY_LABELS[facultyId]}`,
      kind: 'link',
      url: normalizeUrl(item.link),
    };
  }
  return { label: raw, kind: 'link', url: normalizeUrl(item.link) };
}

function fallbackFacultyButton(facultyId: string, topic: string): ActionButton | null {
  const url = FACULTY_TOPIC_FALLBACK_URLS[facultyId]?.[topic];
  if (!url) return null;

  const topicLabel = topic === 'harmonogram'
    ? 'Harmonogramy zajęć'
    : topic === 'egzamin'
      ? 'Harmonogramy egzaminów'
      : topic === 'sylabus'
        ? 'Sylabusy'
        : topic === 'dziekanat'
          ? 'Dziekanat'
          : 'Informacje';

  return {
    label: `${topicLabel} ${FACULTY_LABELS[facultyId] ?? facultyId.toUpperCase()}`,
    kind: 'link',
    url: normalizeUrl(url),
  };
}

export async function buildActionButtons(input: {
  topicTags: string[];
  scope: 'general' | 'faculty';
  facultyId: string | null;
  responseType: 'answer' | 'fallback' | 'clarification' | 'refusal';
  sourceUrls?: string[];
}): Promise<ActionButton[]> {
  if (input.responseType === 'refusal') return [];

  const wpItems = await getWpCatalog();
  const buttons: ActionButton[] = [];

  if (input.sourceUrls?.length) {
    const sourceSet = new Set(input.sourceUrls.map(normalizeUrl));
    for (const item of wpItems) {
      if (isCopyLike(item)) continue;
      if (sourceSet.has(normalizeUrl(item.link))) buttons.push(toButton(item));
    }
  }

  if (input.scope === 'general') {
    for (const topic of input.topicTags) {
      const matches = rankGeneralTopicItems(topic, wpItems).slice(0, topic === 'stypendium' ? 7 : 3);
      buttons.push(...matches.map(toButton));
    }
  }

  if (input.scope === 'faculty' && input.facultyId) {
    for (const topic of input.topicTags) {
      const matches = rankFacultyItems(input.facultyId, topic, wpItems).slice(0, 4);
      if (matches.length > 0) {
        buttons.push(...matches.map((item) => labelFacultyItem(input.facultyId!, topic, item)));
      } else {
        const fallback = fallbackFacultyButton(input.facultyId, topic);
        if (fallback) buttons.push(fallback);
      }
    }
  }

  return dedupe(buttons).slice(0, 8);
}