export interface ActionButton {
  label: string;
  kind: 'link' | 'query';
  url?: string;
  query?: string;
}

const GENERAL_TOPIC_LINKS: Record<string, ActionButton[]> = {
  stypendium: [
    { label: 'Stypendium Rektora', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-rektora/' },
    { label: 'Stypendium Socjalne', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-socjalne/' },
    { label: 'Dla osób z niepełnosprawnościami', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-dla-niepelnosprawnych/' },
    { label: 'Zapomogi', kind: 'link', url: 'https://student.sum.edu.pl/zapomogi/' },
    { label: 'System zachęt KPO', kind: 'link', url: 'https://student.sum.edu.pl/stypendia-w-ramach-systemu-zachet-kpo/' },
    { label: 'Stypendium Ministra', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-ministra/' },
    { label: 'Świadczenia i stypendia', kind: 'link', url: 'https://student.sum.edu.pl/swiadczenia-i-stypendia/' },
  ],
  ubezpieczenie: [
    { label: 'Ubezpieczenie studentów', kind: 'link', url: 'https://student.sum.edu.pl/ubezpieczenie-studentow-i-doktorantow/' },
  ],
  legitymacja: [
    { label: 'Usługi informatyczne', kind: 'link', url: 'https://student.sum.edu.pl/uslugi-informatyczne-dla-studentow/' },
  ],
  erasmus: [
    { label: 'Wyjazdy studentów', kind: 'link', url: 'https://student.sum.edu.pl/wyjazdy-studentow/' },
  ],
  praktyki: [
    { label: 'Praktyki studenckie', kind: 'link', url: 'https://student.sum.edu.pl/praktyki/' },
  ],
  akademik: [
    { label: 'Domy studenta', kind: 'link', url: 'https://student.sum.edu.pl/domy-studenta/' },
  ],
};

const FACULTY_SECTIONS: Record<string, Partial<Record<string, ActionButton[]>>> = {
  wnmz: {
    kontakt: [{ label: 'Kontakt WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/kontakt/' }],
    dziekanat: [{ label: 'Dziekanat WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/kontakt/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-zajec/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/dokumenty-do-pobrania/' }],
    regulamin: [{ label: 'Regulaminy WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/wnmz-regulaminy/' }],
  },
  wnmk: {
    kontakt: [{ label: 'Kontakt WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/kontakt/' }],
    dziekanat: [{ label: 'Dziekanat WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/kontakt/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-zajec/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/dokumenty-do-pobrania/' }],
    regulamin: [{ label: 'Regulaminy WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/regulaminy/' }],
  },
  wnozk: {
    kontakt: [{ label: 'Kontakt WNoZK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/kontakt/' }],
    dziekanat: [{ label: 'Dziekanat WNoZK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/kontakt/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki WNoZK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty WNoZK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/dokumenty-do-pobrania/' }],
    regulamin: [{ label: 'Regulaminy WNoZK', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/regulaminy/' }],
  },
  wnf: {
    kontakt: [{ label: 'Kontakt WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/kontakt/' }],
    dziekanat: [{ label: 'Dziekanat WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/kontakt/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-zajec/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/dokumenty-do-pobrania/' }],
    regulamin: [{ label: 'Regulaminy WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/regulaminy/' }],
  },
  wzpb: {
    kontakt: [{ label: 'Kontakt WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/kontakt-opiekunowie-roku/' }],
    dziekanat: [{ label: 'Dziekanat WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/kontakt-opiekunowie-roku/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-zajec/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/dokumenty-do-pobrania/' }],
    regulamin: [{ label: 'Regulaminy WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/regulaminy/' }],
  },
  fbb: {
    kontakt: [{ label: 'Kontakt FBB', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/kontakt/' }],
    dziekanat: [{ label: 'Dziekanat FBB', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/kontakt/' }],
    harmonogram: [
      { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy/' },
      { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy-egzaminow/' },
    ],
    egzamin: [{ label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy-egzaminow/' }],
    praktyki: [{ label: 'Praktyki FBB', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/praktyki/' }],
    dokumenty: [{ label: 'Dokumenty FBB', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/dokumenty-do-pobrania-kopia/' }],
    regulamin: [{ label: 'Regulaminy FBB', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/regulaminy/' }],
  },
};

export function buildActionButtons(input: {
  topicTags: string[];
  scope: 'general' | 'faculty';
  facultyId: string | null;
  responseType: 'answer' | 'fallback' | 'clarification' | 'refusal';
}): ActionButton[] {
  if (input.responseType === 'refusal') return [];

  const buttons: ActionButton[] = [];

  if (input.scope === 'general') {
    for (const tag of input.topicTags) {
      buttons.push(...(GENERAL_TOPIC_LINKS[tag] ?? []));
    }
  }

  if (input.scope === 'faculty' && input.facultyId) {
    const facultyConfig = FACULTY_SECTIONS[input.facultyId] ?? {};
    for (const tag of input.topicTags) {
      buttons.push(...(facultyConfig[tag] ?? []));
    }
  }

  const seen = new Set<string>();
  return buttons.filter((button) => {
    const key = `${button.kind}:${button.label}:${button.url ?? button.query ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}