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
  // Faculty of Health Sciences in Katowice (WNoZK)
  // Note: avoid ambiguous keywords like bare "pielęgniarstwo" - use specific ones like "nauk o zdrowiu"
  wnozk: ['zdrowie katowice', 'wnozk', 'nauk o zdrowiu', 'zdrowiu w katowicach', 'zdrowiu katowice',
           'pielęgniarstwo katowice', 'nauk zdrowiu'],
  // Faculty of Pharmaceutical Sciences in Sosnowiec (WNF)
  wnf: ['farmacja', 'wnf', 'farmaceutycznych', 'sosnowiec', 'farmacja sosnowiec',
         'nauk farmaceutycznych', 'wydział farmacji'],
  // Public Health in Bytom (WZPB) - if indexed
  wzpb: ['bytom', 'wzpb', 'zdrowia publicznego', 'zdrowie publiczne bytom'],
  // Branch in Bielsko-Biała (Filia)
  fbb: ['bielsko', 'fbb', 'filia', 'bielsko-biała', 'bielsku', 'filia bielsko',
        'bielsko biała', 'filia bb'],
};

// ── Programs for faculties requiring clarification (e.g., harmonograms need program selection) ─────
export const FACULTY_PROGRAMS: Record<string, { id: string; name: string; keywords: string[] }[]> = {
  wnozk: [
    { id: 'pielegniarstwo', name: 'Pielęgniarstwo', keywords: ['pielęgniarstwo', 'pielegniarstwo', 'pielęgniarstwa', 'pielegniarstwa'] },
    { id: 'fizjoterapia', name: 'Fizjoterapia', keywords: ['fizjoterapia', 'fizjoterapii'] },
    { id: 'poloznictwo', name: 'Położnictwo', keywords: ['położnictwo', 'poloznictwo', 'położnictwa', 'poloznictwa'] },
    { id: 'elektroradiologia', name: 'Elektroradiologia', keywords: ['elektroradiologia'] },
  ],
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
  harmonogram: ['harmonogarm', 'harmonogram', 'plan zajęć', 'plan zajec', 'rozkład', 'plan z', 'harmonogram z'],
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
  needs_program_clarification?: boolean;              // Flaga: czy potrzeba pytania o kierunek
  detected_program?: string | null;                  // Jeśli user wspomniał kierunek, jaki?
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

   // ── Program detection (for faculties like WNoZK that need clarification) ──
   // IMPORTANT: Try to detect program even if faculty not detected.
   // This handles cases like "harmonogram fizjoterapii?" (program without explicit faculty mention).
   let detected_program: string | null = null;
   for (const [fid, programs] of Object.entries(FACULTY_PROGRAMS)) {
     for (const prog of programs) {
       if (prog.keywords.some(k => q.includes(k))) {
         detected_program = prog.id;
         // If program is detected from a faculty but faculty wasn't explicitly mentioned, infer it
         if (!faculty_id && fid === 'wnozk') {
           faculty_id = fid;
           faculty_detection_confidence = 0.85;  // High confidence from program keyword
         }
         break;
       }
     }
     if (detected_program) break;
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

  // ── Determine if program clarification needed ──
  // For WNoZK + harmonogram/plan zajęć → ask which program if not detected
  const needs_program_clarification =
    faculty_id === 'wnozk' &&
    topic_tags.includes('harmonogram') &&
    !detected_program;

  return {
    intent: topic_tags[0] ?? 'general',
    scope,
    faculty_id,
    topic_tags,
    is_follow_up,
    is_ambiguous,
    query_classification_confidence: parseFloat(query_classification_confidence.toFixed(3)),
    faculty_detection_confidence: parseFloat(faculty_detection_confidence.toFixed(3)),
    needs_program_clarification,
    detected_program,
  };
}
