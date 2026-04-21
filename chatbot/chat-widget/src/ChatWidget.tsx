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

const GENERAL_QUICK_ACTIONS = [
  { label: 'Dziekanat', query: 'Godziny i kontakt dziekanatu' },
  { label: 'Stypendia', query: 'Jakie stypendia mogę otrzymać?' },
  { label: 'Praktyki', query: 'Informacje o praktykach zawodowych' },
  { label: 'Erasmus', query: 'Jak wziąć udział w programie Erasmus?' },
  { label: 'Opłaty', query: 'Opłaty za studia i terminy płatności' },
  { label: 'Dokumenty', query: 'Jakie dokumenty są potrzebne do spraw studenckich?' },
  { label: 'Legitymacja', query: 'Jak uzyskać legitymację studencką?' },
  { label: 'Ubezpieczenie', query: 'Ubezpieczenie studentów' },
];

const FACULTY_QUICK_ACTIONS = [
  { label: 'Dziekanat', query: 'Kontakt i godziny dziekanatu' },
  { label: 'Harmonogram', query: 'Harmonogram zajęć i egzaminów' },
  { label: 'Praktyki', query: 'Informacje o praktykach zawodowych' },
  { label: 'Dokumenty', query: 'Dokumenty do pobrania dla studentów' },
  { label: 'Regulaminy', query: 'Najważniejsze regulaminy i zasady studiowania' },
  { label: 'Kontakt', query: 'Gdzie i jak załatwić sprawy studenckie' },
];

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
  const quickActions = faculty === 'general' ? GENERAL_QUICK_ACTIONS : FACULTY_QUICK_ACTIONS;

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

              {/* Quick actions */}
              {messages.length <= 1 && (
                <div className={styles.quickActions}>
                  {quickActions.map(a => (
                    <button key={a.label} className={styles.quickBtn} onClick={() => sendMessage(a.query)}>
                      {a.label}
                    </button>
                  ))}
                </div>
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
