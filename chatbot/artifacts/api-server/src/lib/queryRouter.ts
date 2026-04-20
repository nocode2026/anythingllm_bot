// ── Faculty definitions ─────────────────────────────────────────────────────
// Key: internal faculty ID | Values: keywords that trigger faculty context in queries
export const FACULTIES: Record<string, string[]> = {
  // Faculty of Medical Sciences in Zabrze (WNMZ)
  wnmz: ['zabrze', 'wnmz', 'nauk medycznych zabrze', 'medycznych w zabrzu', 'wydział zabrze', 
          'medycyna zabrze', 'lekarski zabrze', 'stomatologia zabrze', 'dentystyka zabrze',
          'pielęgniarstwo zabrze', 'ratownictwo zabrze', 'zabrze medycyna'],
  // Faculty of Medical Sciences in Katowice (WNMK)
  wnmk: ['katowice medycyna', 'wnmk', 'nauk medycznych katowice', 'medycznych w katowicach', 'wydział katowice',
          'medycyna katowice', 'lekarski katowice', 'katowice lekarski', 'wydział medycyny'],
  // Faculty of Health Sciences in Katowice (WNoZ)
  wnozk: ['zdrowie katowice', 'wnozk', 'nauk o zdrowiu', 'zdrowiu w katowicach', 'zdrowiu katowice',
           'pielęgniarstwo katowice', 'pielęgniarstwo', 'nauk zdrowiu'],
  // Faculty of Pharmaceutical Sciences in Sosnowiec (WNF)
  wnf: ['farmacja', 'wnf', 'farmaceutycznych', 'sosnowiec', 'farmacja sosnowiec',
         'nauk farmaceutycznych', 'wydział farmacji'],
  // Public Health in Bytom (WZPB) - if indexed
  wzpb: ['bytom', 'wzpb', 'zdrowia publicznego', 'zdrowie publiczne bytom'],
  // Branch in Bielsko-Biała (Filia)
  fbb: ['bielsko', 'fbb', 'filia', 'bielsko-biała', 'bielsku', 'filia bielsko',
        'bielsko biała', 'filia bb'],
};

// Inherently general topics — must NOT be faculty-scoped even with faculty_context
export const GENERAL_TOPICS = [
  'stypendium', 'stypendia', 'erasmus', 'dom studenta', 'akademik',
  'ubezpieczenie', 'wsparcie', 'mostum', 'biuro karier', 'samorząd',
  'legitymacja', 'mlegitymacja', 'organizacje studenckie', 'sport',
  'aktualności', 'komunikat',
];

export const TOPIC_ALIASES: Record<string, string[]> = {
  stypendium: ['stypendium', 'stypa', 'stypendium rektora', 'stypendium socjalne', 'stypendium ministra'],
  dziekanat: ['dzikanat', 'dziekanat', 'dziekanatu', 'sekretariat'],
  harmonogram: ['harmonogarm', 'harmonogram', 'plan zajęć', 'plan zajec', 'rozkład'],
  egzamin: ['egzamin', 'egzaminy', 'kolokwium', 'zaliczeń', 'zaliczenia'],
  praktyki: ['praksy', 'praktyki', 'staż', 'staz', 'praktyka', 'praktyk'],
  erasmus: ['erasmus', 'wymiana', 'wyjazd zagraniczny'],
  akademik: ['akademik', 'dom studenta', 'bursa'],
  legitymacja: ['legitymacja', 'mlegitymacja', 'karta studenta'],
  ubezpieczenie: ['ubezpieczenie', 'ubezpieczenia'],
  kontakt: ['kontakt', 'telefon', 'email', 'adres', 'godziny pracy', 'godziny przyjęć'],
};

export interface QueryClassification {
  intent: string;
  scope: 'general' | 'faculty';
  faculty_id: string | null;
  topic_tags: string[];
  is_follow_up: boolean;
  is_ambiguous: boolean;
  query_classification_confidence: number;
  faculty_detection_confidence: number;
}

const FOLLOW_UP_PATTERNS = [
  /^(a|i) (gdzie|kontakt|adres|telefon|email|kiedy|do kiedy|link|strona|więcej|jak|dlaczego|ile|co jeszcze)/i,
  /^(gdzie|kontakt|kiedy|ile|jak|dlaczego|co jeszcze|strona|link)\?*$/i,
  /^(a to|i to|to gdzie|to kiedy|to jak)\b/i,
  /^(zabrze|katowice|sosnowiec|bytom|bielsko(-biała)?|wnmz|wnmk|wnozk|wnf|wzpb|fbb)\?*$/i,
];

export function classifyQuery(
  query: string,
  sessionFacultyContext?: string | null
): QueryClassification {
  const q = query.toLowerCase().trim();

  // ── Follow-up detection ──
  const is_follow_up = FOLLOW_UP_PATTERNS.some(p => p.test(q));

  // ── Topic tags detection ──
  const topic_tags: string[] = [];
  for (const [tag, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (aliases.some(a => q.includes(a))) topic_tags.push(tag);
  }

  // ── Faculty detection (deterministic) ──
  let faculty_id: string | null = null;
  let faculty_detection_confidence = 0;

  for (const [fid, keywords] of Object.entries(FACULTIES)) {
    if (keywords.some(k => q.includes(k))) {
      faculty_id = fid;
      faculty_detection_confidence = 0.90;
      break;
    }
  }

  // Inherit from session if not explicitly mentioned
  if (!faculty_id && sessionFacultyContext) {
    faculty_id = sessionFacultyContext;
    faculty_detection_confidence = 0.70;
  }

  // ── Scope determination ──
  const isGeneralTopic = GENERAL_TOPICS.some(t => q.includes(t));

  let scope: 'general' | 'faculty';
  if (isGeneralTopic) {
    // General topics never forced to faculty scope
    scope = 'general';
    faculty_id = null;          // strip faculty even if detected
    faculty_detection_confidence = 0;
  } else if (faculty_id && faculty_detection_confidence >= 0.65) {
    scope = 'faculty';
  } else {
    // No clear faculty → general
    scope = 'general';
    faculty_id = null;
    faculty_detection_confidence = 0;
  }

  // ── Classification confidence ──
  const hasTopics = topic_tags.length > 0;
  const hasKeywords = q.split(' ').length >= 2;
  let query_classification_confidence = 0.5;
  if (hasTopics) query_classification_confidence += 0.25;
  if (hasKeywords) query_classification_confidence += 0.15;
  if (faculty_detection_confidence >= 0.85) query_classification_confidence += 0.10;

  query_classification_confidence = Math.min(query_classification_confidence, 1.0);

  const is_ambiguous = query_classification_confidence < 0.60 || (q.length < 5);

  return {
    intent: topic_tags[0] ?? 'general',
    scope,
    faculty_id,
    topic_tags,
    is_follow_up,
    is_ambiguous,
    query_classification_confidence: parseFloat(query_classification_confidence.toFixed(3)),
    faculty_detection_confidence: parseFloat(faculty_detection_confidence.toFixed(3)),
  };
}
