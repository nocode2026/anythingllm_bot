import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './ChatWidget.module.css';

const FACULTIES = [
  { id: 'wnmz', label: 'WNMZ' },
  { id: 'wnmk', label: 'WNMK' },
  { id: 'wnozk', label: 'WNOZK' },
  { id: 'wnf', label: 'WNFS' },
  { id: 'wzpb', label: 'WZPB' },
  { id: 'fbb', label: 'FBB' },
];

const FACULTY_SHORT_LABELS: Record<string, string> = {
  general: 'OGÓLNE',
  wnmz: 'WNMZ',
  wnmk: 'WNMK',
  wnozk: 'WNOZK',
  wnf: 'WNFS',
  wzpb: 'WZPB',
  fbb: 'FBB',
};

/* ── Navigation tree ─────────────────────────────────────────────────────────── */
type NavLeaf =
  | { label: string; kind: 'link'; url: string }
  | { label: string; kind: 'query'; query: string };
type NavGroup = { label: string; kind: 'group'; children: NavLeaf[] };
type NavNode = NavLeaf | NavGroup;

const GENERAL_NAV: NavNode[] = [
  {
    label: 'Szybkie linki', kind: 'group',
    children: [
      { label: 'Opłaty za studia', kind: 'link', url: 'https://student.sum.edu.pl/oplaty-za-studia/' },
      { label: 'Domy studenta', kind: 'link', url: 'https://student.sum.edu.pl/domy-studenta/' },
      { label: 'Program MosTUM', kind: 'link', url: 'https://student.sum.edu.pl/mostum/' },
      { label: 'Erasmus+', kind: 'link', url: 'https://student.sum.edu.pl/erasmus/' },
      { label: 'Welcome Center', kind: 'link', url: 'https://student.sum.edu.pl/welcome-centre-2/' },
      { label: 'Praktyki studenckie', kind: 'link', url: 'https://student.sum.edu.pl/wyszukiwarka-placowek/' },
      { label: 'Kliniki SUM', kind: 'link', url: 'https://student.sum.edu.pl/szpitale-kliniczne-sum/' },
      { label: 'Centra symulacji', kind: 'link', url: 'https://symulacja.sum.edu.pl/' },
      { label: 'Bazy medyczne', kind: 'link', url: 'https://biblioteka.sum.edu.pl/zasoby/' },
      { label: 'BHP – Pierwsza pomoc', kind: 'link', url: 'https://bhp.sum.edu.pl/pierwsza-pomoc' },
      { label: 'Wyjazdy studentów', kind: 'link', url: 'https://student.sum.edu.pl/wyjazdy-studentow/' },
    ],
  },
  {
    label: 'Organizacje', kind: 'group',
    children: [
      { label: 'Samorząd WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/wydzialowa-rada-samorzadu-studenckiego-wnmz-zabrze/' },
      { label: 'Samorząd WNF', kind: 'link', url: 'https://student.sum.edu.pl/wydzialowa-rada-samorzadu-studenckiego-wnf-sosnowiec/' },
      { label: 'Samorząd WNMK', kind: 'link', url: 'https://student.sum.edu.pl/wydzialowa-rada-samorzadu-studenckiego-wnmk-katowice/' },
      { label: 'Samorząd WNOZK', kind: 'link', url: 'https://student.sum.edu.pl/homepage/student-council-of-the-faculty-of-health-sciences-in-katowice-2/' },
      { label: 'Samorząd WZPB', kind: 'link', url: 'https://student.sum.edu.pl/wydzialowa-rada-samorzadu-studenckiego-wzpb-bytom/' },
      { label: 'STN', kind: 'link', url: 'https://student.sum.edu.pl/studenckie-towarzystwo-naukowe/' },
      { label: 'Stowarzyszenia WNF', kind: 'link', url: 'https://student.sum.edu.pl/stowarzyszenie-studenckie-wnf-w-sosnowcu/' },
      { label: 'Stowarzyszenia WNMZ', kind: 'link', url: 'https://student.sum.edu.pl/stowarzyszenia-studenckie-wnm-w-zabrzu/' },
      { label: 'Chór SUM', kind: 'link', url: 'https://student.sum.edu.pl/chor-slaskiego-uniwersytetu-medycznego-w-katowicach/' },
      { label: 'IFMSA', kind: 'link', url: 'https://student.sum.edu.pl/ifmsa/' },
      { label: 'Teatr Stosowany SUM', kind: 'link', url: 'https://student.sum.edu.pl/teatr-stosowany-sum/' },
    ],
  },
  {
    label: 'Stypendia i wsparcie finansowe', kind: 'group',
    children: [
      { label: 'Stypendium Rektora', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-rektora/' },
      { label: 'Stypendium Socjalne', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-socjalne/' },
      { label: 'Stypendium dla niepełnosprawnych', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-dla-niepelnosprawnych/' },
      { label: 'Zapomogi', kind: 'link', url: 'https://student.sum.edu.pl/zapomogi/' },
      { label: 'Stypendium Ministra', kind: 'link', url: 'https://student.sum.edu.pl/stypendium-ministra/' },
      { label: 'Stypendia KPO', kind: 'link', url: 'https://student.sum.edu.pl/stypendia-w-ramach-systemu-zachet-kpo/' },
      { label: 'Inne stypendia', kind: 'link', url: 'https://student.sum.edu.pl/inne-stypendia/' },
    ],
  },
  {
    label: 'Dodatkowe świadczenia', kind: 'group',
    children: [
      { label: 'Ubezpieczenie studentów i doktorantów', kind: 'link', url: 'https://student.sum.edu.pl/ubezpieczenie-studentow-i-doktorantow/' },
      { label: 'Wsparcie psychologiczne', kind: 'link', url: 'https://student.sum.edu.pl/wsparcie-psychologiczne/' },
      { label: 'Domy studenta', kind: 'link', url: 'https://student.sum.edu.pl/domy-studenta/' },
      { label: 'Biuro Karier SUM', kind: 'link', url: 'https://student.sum.edu.pl/biuro-karier-sum/' },
    ],
  },
];

const FACULTY_NAV: Record<string, NavNode[]> = {
  wnmz: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-zajec/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/praktyki/' },
    { label: 'Dokumenty do pobrania', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/dokumenty-do-pobrania/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/wnmz-regulaminy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/kontakt/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/opiekunowie-roku/' },
    { label: 'Placówki partnerskie', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-zabrzu/placowki-partnerskie-wnmz/' },
  ],
  wnmk: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-zajec/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/praktyki/' },
    { label: 'Dokumenty do pobrania', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/dokumenty-do-pobrania/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/regulaminy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/kontakt/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/opiekunowie-roku/' },
    { label: 'Placówki partnerskie', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-medycznych-w-katowicach/placowki-partnerskie-wnmk/' },
  ],
  wnozk: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/praktyki/' },
    { label: 'Dokumenty do pobrania', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/dokumenty-do-pobrania/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/regulaminy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/kontakt/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/opiekunowie-roku/' },
    { label: 'Placówki partnerskie', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-zdrowiu-w-katowicach/placowki-partnerskie-wnozk/' },
  ],
  wnf: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-zajec/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/praktyki/' },
    { label: 'Dokumenty do pobrania', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/dokumenty-do-pobrania/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/regulaminy/' },
    { label: 'Sylabusy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/sylabusy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/kontakt/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-nauk-o-farmaceutycznych-w-sosnowcu/opiekunowie-roku/' },
  ],
  wzpb: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-zajec/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/praktyki/' },
    { label: 'Dokumenty do pobrania', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/dokumenty-do-pobrania/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/regulaminy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/kontakt-opiekunowie-roku/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/opiekunowie-roku/' },
    { label: 'Placówki partnerskie', kind: 'link', url: 'https://student.sum.edu.pl/wydzial-zdrowia-publicznego-w-bytomiu/placowki-partnerski-wzpb/' },
  ],
  fbb: [
    { label: 'Harmonogramy zajęć', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy/' },
    { label: 'Harmonogramy egzaminów', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/harmonogramy-egzaminow/' },
    { label: 'Praktyki', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/praktyki/' },
    { label: 'Regulaminy', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/regulaminy/' },
    { label: 'Kontakt', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/kontakt/' },
    { label: 'Opiekunowie roku', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/opiekunowie-roku/' },
    { label: 'Placówki partnerskie', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/placowki-partnerskie-fbb/' },
    { label: 'FAQ', kind: 'link', url: 'https://student.sum.edu.pl/filia-w-bielsku-bialej/fbb_faq_qa/' },
  ],
};

interface Source {
  url: string;
  title: string;
  excerpt?: string;
  publish_date?: string | null;
}

interface ActionButton {
  label: string;
  kind: 'link' | 'query';
  url?: string;
  query?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response_type?: 'answer' | 'fallback' | 'clarification' | 'refusal';
  sources?: Source[];
  suggested_questions?: string[];
  action_buttons?: ActionButton[];
  final_answer_confidence?: number;
  confidence_note?: string | null;
  ts: Date;
}

interface Props {
  apiUrl: string;
  theme: 'light' | 'dark';
}

/* ── QuickNav: hierarchical navigation panel ──────────────────────────────── */
function QuickNav({ nav, onSend }: { nav: NavNode[]; onSend: (text: string) => void }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const currentItems: NavNode[] = activeGroup
    ? ((nav.find(n => n.kind === 'group' && n.label === activeGroup) as NavGroup | undefined)?.children ?? [])
    : nav;

  return (
    <div className={styles.quickNav}>
      {activeGroup && (
        <div className={styles.quickNavBreadcrumb}>
          <button className={styles.backBtn} onClick={() => setActiveGroup(null)}>
            ← Wróć
          </button>
          <span className={styles.quickNavGroupLabel}>{activeGroup}</span>
        </div>
      )}
      <div className={styles.quickNavItems}>
        {currentItems.map((item) => {
          if (item.kind === 'group') {
            return (
              <button
                key={item.label}
                className={`${styles.quickBtn} ${styles.quickBtnGroup}`}
                onClick={() => setActiveGroup(item.label)}
              >
                {item.label} <span className={styles.chevron}>›</span>
              </button>
            );
          } else if (item.kind === 'link') {
            return (
              <button
                key={item.label}
                className={styles.quickBtn}
                onClick={() => onSend(`Krótko opisz, co znajdę na stronie "${item.label}", wypisz ewentualne podsekcje i na końcu podaj link: ${item.url}`)}
              >
                {item.label}
              </button>
            );
          } else {
            return (
              <button
                key={item.label}
                className={styles.quickBtn}
                onClick={() => onSend((item as { kind: 'query'; query: string }).query)}
              >
                {item.label}
              </button>
            );
          }
        })}
      </div>
    </div>
  );
}

function renderInlineMarkup(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);

    if (linkMatch) {
      parts.push(
        <a
          key={`${keyPrefix}_link_${tokenIndex}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.inlineLink}
        >
          {linkMatch[1]}
        </a>
      );
    } else if (boldMatch) {
      parts.push(
        <strong key={`${keyPrefix}_strong_${tokenIndex}`}>{boldMatch[1]}</strong>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderMessageContent(text: string, messageId: string): React.ReactNode {
  const blocks = text.split(/\n\n+/).filter(Boolean);
  return blocks.map((block, blockIndex) => {
    const trimmed = block.trim();
    const listMatch = trimmed.match(/^\d+\.\s+/m);

    if (listMatch) {
      const lines = trimmed.split('\n').filter(Boolean);
      return (
        <div key={`${messageId}_block_${blockIndex}`} className={styles.messageBlock}>
          {lines.map((line, lineIndex) => (
            <div key={`${messageId}_line_${blockIndex}_${lineIndex}`} className={styles.messageLine}>
              {renderInlineMarkup(line, `${messageId}_${blockIndex}_${lineIndex}`)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <p key={`${messageId}_block_${blockIndex}`} className={styles.messageText}>
        {renderInlineMarkup(trimmed, `${messageId}_${blockIndex}`)}
      </p>
    );
  });
}

export function ChatWidget({ apiUrl, theme }: Props) {
  const [open, setOpen] = useState(false);
  const [faculty, setFaculty] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectFaculty = (fid: string) => {
    setFaculty(fid);
    setOnboarding(false);
    setSessionId(null);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Witaj! Jestem asystentem studenta Slaskiego Uniwersytetu Medycznego (SUM). Moge odpowiadac na pytania dotyczace studiow, stypendiow, praktyk i innych spraw studenckich. W czym moge pomoc?`,
      ts: new Date(),
    }]);
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      ts: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const payload: Record<string, string> = { message: text };
      if (sessionId) payload.session_id = sessionId;
      if (faculty && faculty !== 'general') payload.faculty_override = faculty;

      const res = await fetch(`${apiUrl}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.session_id) setSessionId(data.session_id);

      const botMsg: Message = {
        id: Date.now().toString() + '_bot',
        role: 'assistant',
        content: data.answer,
        response_type: data.response_type,
        sources: data.sources ?? [],
        suggested_questions: data.suggested_questions ?? [],
        action_buttons: data.action_buttons ?? [],
        final_answer_confidence: data.final_answer_confidence,
        confidence_note: data.confidence_note,
        ts: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        role: 'assistant',
        content: 'Blad polaczenia z serwerem. Sprobuj ponownie.',
        ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [apiUrl, faculty, sessionId, loading]);

  const changeFaculty = () => {
    setFaculty(null);
    setOnboarding(true);
    setSessionId(null);
    setMessages([]);
    setInput('');
  };

  const resetChat = async () => {
    const oldSessionId = sessionId;
    setSessionId(null);
    if (oldSessionId) {
      try {
        await fetch(`${apiUrl}/api/chat/session/${oldSessionId}`, { method: 'DELETE' });
      } catch {
        // Ignore reset errors and reset locally anyway.
      }
    }

    setFaculty(null);
    setOnboarding(true);
    setMessages([]);
    setInput('');
  };

  const confidence = (c?: number) => {
    if (c === undefined || c === 0) return null;
    if (c >= 0.80) return 'high';
    if (c >= 0.60) return 'medium';
    return 'low';
  };

  const selectedFacultyLabel = FACULTY_SHORT_LABELS[faculty ?? 'general'] ?? 'SUM';
  const currentNav: NavNode[] = faculty === 'general' ? GENERAL_NAV : (FACULTY_NAV[faculty ?? ''] ?? []);

  return (
    <div className={`${styles.root} ${styles[theme]}`} data-sum-chatbot>
      {/* Floating button */}
      {!open && (
        <button className={styles.fab} onClick={() => setOpen(true)} aria-label="Otworz czat asystenta">
          <ChatIcon />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className={styles.window}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.logo}>SUM</span>
              <span>Asystent Studenta</span>
            </div>
            <div className={styles.headerActions}>
              {faculty && (
                <button className={styles.facultyBtn} onClick={changeFaculty} title="Zmien wydzial lub tryb">
                  {selectedFacultyLabel}
                </button>
              )}
              {!onboarding && (
                <button className={styles.resetBtn} onClick={resetChat} title="Reset czatu" aria-label="Reset czatu">
                  ↺
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Zamknij">×</button>
            </div>
          </div>

          {/* Onboarding */}
          {onboarding && (
            <div className={styles.onboarding}>
              <p className={styles.onboardingTitle}>Wybierz tryb: wydział albo ogólne pytania</p>
              <button className={styles.facultyChoice} onClick={() => selectFaculty('general')}>
                Ogólne pytania (strona główna)
              </button>
              {FACULTIES.map(f => (
                <button key={f.id} className={styles.facultyChoice} onClick={() => selectFaculty(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {!onboarding && (
            <>
              <div className={styles.messages}>
                {messages.map(msg => {
                  const showAuxiliarySections = msg.response_type !== 'answer';
                  return (
                  <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                    <div className={styles.bubble}>
                      {renderMessageContent(msg.content, msg.id)}

                      {/* Confidence note */}
                      {msg.confidence_note && (
                        <div className={`${styles.confidenceNote} ${styles[confidence(msg.final_answer_confidence) ?? '']}`}>
                          {msg.confidence_note}
                        </div>
                      )}

                      {/* Sources */}
                      {showAuxiliarySections && msg.sources && msg.sources.length > 0 && (
                        <div className={styles.sources}>
                          <span className={styles.sourcesLabel}>Zrodla:</span>
                          <div className={styles.actionRow}>
                            {msg.sources.map((s, i) => (
                              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                                {s.title || s.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {showAuxiliarySections && msg.action_buttons && msg.action_buttons.length > 0 && (
                        <div className={styles.sources}>
                          <span className={styles.sourcesLabel}>Przejdz od razu:</span>
                          <div className={styles.actionRow}>
                            {msg.action_buttons.map((button, i) => (
                              button.kind === 'link' && button.url ? (
                                <a
                                  key={`${msg.id}_ab_${i}`}
                                  href={button.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.linkBtn}
                                >
                                  {button.label}
                                </a>
                              ) : (
                                <button
                                  key={`${msg.id}_ab_${i}`}
                                  className={styles.quickBtn}
                                  onClick={() => sendMessage(button.query ?? button.label)}
                                  type="button"
                                >
                                  {button.label}
                                </button>
                              )
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested follow-up questions */}
                      {showAuxiliarySections && msg.suggested_questions && msg.suggested_questions.length > 0 && (
                        <div className={styles.sources}>
                          <div className={styles.actionRow}>
                            {msg.suggested_questions.map((q, i) => (
                              <button
                                key={`${msg.id}_sq_${i}`}
                                className={styles.quickBtn}
                                onClick={() => sendMessage(q)}
                                type="button"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <span className={styles.timestamp}>
                        {msg.ts.toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  );
                })}

                {loading && (
                  <div className={`${styles.message} ${styles.assistant}`}>
                    <div className={styles.bubble}>
                      <div className={styles.typing}><span /><span /><span /></div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick navigation */}
              {messages.length <= 1 && currentNav.length > 0 && (
                <QuickNav nav={currentNav} onSend={sendMessage} />
              )}

              {/* Input */}
              <div className={styles.inputRow}>
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                  placeholder="Napisz pytanie..."
                  disabled={loading}
                  maxLength={1000}
                />
                <button
                  className={styles.sendBtn}
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  aria-label="Wyslij"
                >
                  <SendIcon />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  );
}
