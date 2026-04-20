type WPItem = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  type: string;
};

const FACULTIES = [
  { id: 'wnmz', label: 'WNMZ', pattern: /wydzial-nauk-medycznych-w-zabrzu/ },
  { id: 'wnmk', label: 'WNMK', pattern: /wydzial-nauk-medycznych-w-katowicach/ },
  { id: 'wnozk', label: 'WNoZK', pattern: /wydzial-nauk-o-zdrowiu-w-katowicach/ },
  { id: 'wnf', label: 'WNF', pattern: /wydzial-nauk-farmaceutycznych-w-sosnowcu|wydzial-nauk-o-farmaceutycznych-w-sosnowcu/ },
  { id: 'wzpb', label: 'WZPB', pattern: /wydzial-zdrowia-publicznego-w-bytomiu/ },
  { id: 'fbb', label: 'FBB', pattern: /filia-w-bielsku-bialej/ },
] as const;

const SECTION_PATTERNS = [
  { key: 'dziekanat', pattern: /dziekanat|kontakt/ },
  { key: 'harmonogramy', pattern: /harmonogram/ },
  { key: 'egzaminy', pattern: /egzamin/ },
  { key: 'praktyki', pattern: /praktyki/ },
  { key: 'dokumenty', pattern: /dokumenty-do-pobrania|dokumenty/ },
  { key: 'regulaminy', pattern: /regulamin/ },
  { key: 'opiekunowie', pattern: /opiekunowie-roku|opiekun/ },
] as const;

function facultyForUrl(url: string): string | null {
  for (const faculty of FACULTIES) {
    if (faculty.pattern.test(url)) return faculty.id;
  }
  return null;
}

async function fetchAll(endpoint: string): Promise<WPItem[]> {
  const items: WPItem[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://student.sum.edu.pl/wp-json/wp/v2/${endpoint}?per_page=50&page=${page}&status=publish&_fields=id,slug,link,title,type`
    );

    if (!res.ok) {
      throw new Error(`WP fetch failed for ${endpoint} page=${page}: ${res.status}`);
    }

    const batch = (await res.json()) as WPItem[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);

    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1');
    if (page >= totalPages) break;
    page += 1;
  }

  return items;
}

function summarizeFacultyPages(pages: WPItem[]): Array<Record<string, unknown>> {
  return FACULTIES.map((faculty) => {
    const facultyPages = pages.filter((page) => faculty.pattern.test(page.link));
    const sections = Object.fromEntries(
      SECTION_PATTERNS.map((section) => {
        const matches = facultyPages
          .filter((page) => section.pattern.test(page.link) || section.pattern.test(page.title.rendered))
          .map((page) => ({ title: page.title.rendered.replace(/<[^>]+>/g, '').trim(), url: page.link }));
        return [section.key, matches];
      })
    );

    return {
      faculty_id: faculty.id,
      label: faculty.label,
      total_pages: facultyPages.length,
      sections,
    };
  });
}

async function main(): Promise<void> {
  const [pages, posts, placowki] = await Promise.all([
    fetchAll('pages'),
    fetchAll('posts'),
    fetchAll('placowki'),
  ]);

  const allPages = [...pages, ...posts, ...placowki];
  const facultyPages = allPages.filter((page) => facultyForUrl(page.link));
  const summary = summarizeFacultyPages(facultyPages);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});