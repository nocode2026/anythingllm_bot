// ── Faculty URL patterns ──────────────────────────────────────────────────────
const FACULTY_URL_MAP: Array<[RegExp, string]> = [
  [/wydzial-nauk-medycznych-w-zabrzu|wnmz/, 'wnmz'],
  [/wydzial-nauk-medycznych-w-katowicach|wnmk/, 'wnmk'],
  [/wydzial-nauk-o-zdrowiu-w-katowicach|wnozk/, 'wnozk'],
  [/wydzial-nauk-o-farmaceutycznych-w-sosnowcu|wnf/, 'wnf'],
  [/wydzial-zdrowia-publicznego-w-bytomiu|wzpb/, 'wzpb'],
  [/filia-w-bielsku-bialej|fbb/, 'fbb'],
];

const GENERAL_TOPIC_PATTERNS: Array<[RegExp, string[]]> = [
  [/stypendium|stypendial/, ['stypendium']],
  [/erasmus/, ['erasmus']],
  [/dom.?student|akademik|bursa/, ['akademik']],
  [/legitymacj/, ['legitymacja']],
  [/ubezpieczeni/, ['ubezpieczenie']],
  [/wsparcie.?psychologiczn/, ['wsparcie']],
  [/biuro.?karier/, ['biuro-karier']],
  [/samorząd|samorzad/, ['samorzad']],
  [/erasmus/, ['erasmus']],
  [/mostum/, ['mostum']],
  [/harmonogram/, ['harmonogram']],
  [/egzamin/, ['egzamin']],
  [/dziekanat|sekretariat/, ['dziekanat']],
  [/praktyk/, ['praktyki']],
  [/kontakt/, ['kontakt']],
  [/regulamin/, ['regulamin']],
  [/oplat|czesne/, ['oplaty']],
];

export interface Classification {
  scope: 'general' | 'faculty';
  faculty_id: string | null;
  topic_tags: string[];
  confidence: number;
}

export function classify(url: string, title: string, text: string): Classification {
  const combined = `${url} ${title} ${text}`.toLowerCase();

  // ── Deterministic: faculty from URL (highest priority) ──
  let faculty_id: string | null = null;
  for (const [pattern, fid] of FACULTY_URL_MAP) {
    if (pattern.test(url.toLowerCase())) {
      faculty_id = fid;
      break;
    }
  }

  // ── Deterministic: scope ──
  const scope: 'general' | 'faculty' = faculty_id ? 'faculty' : 'general';

  // ── Heuristic: topic tags ──
  const topic_tags: string[] = [];
  for (const [pattern, tags] of GENERAL_TOPIC_PATTERNS) {
    if (pattern.test(combined)) {
      topic_tags.push(...tags);
    }
  }

  return {
    scope,
    faculty_id,
    topic_tags: [...new Set(topic_tags)],
    confidence: faculty_id ? 0.95 : 0.80,
  };
}
