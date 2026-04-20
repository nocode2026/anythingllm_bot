const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  ubezpieczenie: [
    'Jakie dokumenty sa potrzebne do ubezpieczenia?',
    'Do kiedy moge przystapic do ubezpieczenia?',
    'Gdzie zglosic problem z polisa?',
  ],
  stypendium: [
    'Jakie sa warunki otrzymania tego stypendium?',
    'Jakie dokumenty trzeba zlozyc?',
    'Gdzie sprawdzic terminy naboru?',
  ],
  legitymacja: [
    'Co zrobic, gdy zgubie legitymacje?',
    'Jak przedluzyc waznosc legitymacji?',
    'Jak aktywowac mLegitymacje?',
  ],
  erasmus: [
    'Jak wyglada proces rekrutacji do Erasmus?',
    'Jakie dokumenty sa wymagane przy wyjezdzie?',
    'Gdzie znajde liste uczelni partnerskich?',
  ],
  praktyki: [
    'Jakie sa terminy praktyk dla mojego kierunku?',
    'Jakie dokumenty musze przygotowac na praktyki?',
    'Gdzie znajde placowki praktyk?',
  ],
  akademik: [
    'Jak zlozyc wniosek o miejsce w domu studenta?',
    'Jakie sa terminy i kryteria przydzialu?',
    'Gdzie sprawdzic oplaty za akademik?',
  ],
  dziekanat: [
    'Jakie sa godziny obslugi dziekanatu?',
    'Jaki jest kontakt mailowy i telefoniczny?',
    'Jakie sprawy moge zalatwic online?',
  ],
  harmonogram: [
    'Gdzie znajde aktualny harmonogram zajec?',
    'Kiedy publikowane sa zmiany harmonogramu?',
    'Gdzie sprawdzic terminy egzaminow?',
  ],
  egzamin: [
    'Gdzie znajde terminy egzaminow?',
    'Co zrobic w przypadku kolizji terminow?',
    'Jak wyglada procedura poprawki?',
  ],
  kontakt: [
    'Jaki jest mail do wlasciwej jednostki?',
    'W jakich godzinach mozna sie kontaktowac?',
    'Czy jest formularz kontaktowy online?',
  ],
};

const GENERIC_FALLBACK = [
  'Czy chcesz, zebym podal link do odpowiedniej strony?',
  'Czy interesuja Cie terminy, dokumenty czy kontakt?',
  'Czy mam doprecyzowac to dla konkretnego wydzialu?',
];

export interface SuggestedQuestionsContext {
  currentTopicTags: string[];
  previousTopicTags: string[];
  answerText: string;
  userMessage: string;
  isFollowUp: boolean;
  responseType: 'answer' | 'fallback' | 'clarification' | 'refusal';
  scope: 'general' | 'faculty';
  facultyId: string | null;
}

function inferTopic(
  currentTopicTags: string[],
  previousTopicTags: string[],
  answerText: string
): string | null {
  for (const tag of currentTopicTags) {
    if (TOPIC_SUGGESTIONS[tag]) return tag;
  }

  for (const tag of previousTopicTags) {
    if (TOPIC_SUGGESTIONS[tag]) return tag;
  }

  const lower = answerText.toLowerCase();
  if (lower.includes('stypend')) return 'stypendium';
  if (lower.includes('ubezpiec')) return 'ubezpieczenie';
  if (lower.includes('erasmus')) return 'erasmus';
  if (lower.includes('praktyk')) return 'praktyki';
  if (lower.includes('legitymac')) return 'legitymacja';
  if (lower.includes('dziekanat')) return 'dziekanat';

  return null;
}

function avoidRepeatingUserIntent(candidates: string[], userMessage: string): string[] {
  const m = userMessage.toLowerCase();
  return candidates.filter((q) => !m.includes(q.toLowerCase().slice(0, 16)));
}

function withScopeHint(
  questions: string[],
  scope: 'general' | 'faculty',
  facultyId: string | null
): string[] {
  if (scope === 'faculty' && facultyId) {
    const hint = 'Czy chcesz to doprecyzowac dla Twojego wydzialu?';
    if (!questions.some((q) => q.toLowerCase().includes('wydzial'))) {
      return [questions[0], questions[1], hint];
    }
  }
  return questions;
}

export function buildSuggestedQuestions(ctx: SuggestedQuestionsContext): string[] {
  if (ctx.responseType === 'refusal') return [];

  if (ctx.responseType === 'clarification') {
    return [
      'Czy chodzi o terminy, dokumenty czy kontakt?',
      'Czy pytasz o temat ogolny czy dla konkretnego wydzialu?',
      'Czy mam podac od razu najbardziej pasujacy link?',
    ];
  }

  if (ctx.responseType === 'fallback') {
    return [
      'Czy chcesz, zebym wskazal kontakt do odpowiedniej jednostki?',
      'Czy mam sprobowac znalezc informacje dla konkretnego wydzialu?',
      'Czy podac strony, na ktorych najczesciej jest ta informacja?',
    ];
  }

  const topic = inferTopic(ctx.currentTopicTags, ctx.previousTopicTags, ctx.answerText);
  let base = topic ? TOPIC_SUGGESTIONS[topic] ?? GENERIC_FALLBACK : GENERIC_FALLBACK;

  if (ctx.isFollowUp) {
    // In follow-up mode, bias to deeper executional questions.
    base = [
      'Jaki jest najblizszy termin w tej sprawie?',
      'Jakie dokumenty przygotowac jako kolejny krok?',
      'Gdzie skontaktowac sie, jesli pojawi sie problem?',
    ];
  }

  const deduped = Array.from(new Set(base));
  const filtered = avoidRepeatingUserIntent(deduped, ctx.userMessage);
  const padded = [...filtered, ...GENERIC_FALLBACK].slice(0, 3);
  return withScopeHint(padded, ctx.scope, ctx.facultyId).slice(0, 3);
}
