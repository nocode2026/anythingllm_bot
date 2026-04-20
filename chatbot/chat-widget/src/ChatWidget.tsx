import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './ChatWidget.module.css';

const FACULTIES = [
  { id: 'wnmz', label: 'Wydział Nauk Medycznych w Zabrzu' },
  { id: 'wnmk', label: 'Wydział Nauk Medycznych w Katowicach' },
  { id: 'wnozk', label: 'Wydział Nauk o Zdrowiu w Katowicach' },
  { id: 'wnf', label: 'Wydział Nauk Farmaceutycznych w Sosnowcu' },
  { id: 'wzpb', label: 'Wydział Zdrowia Publicznego w Bytomiu' },
  { id: 'fbb', label: 'Filia w Bielsku-Białej' },
];

const QUICK_ACTIONS = [
  { label: 'Dziekanat', query: 'Godziny i kontakt dziekanatu' },
  { label: 'Stypendia', query: 'Jakie stypendia mogę otrzymać?' },
  { label: 'Praktyki', query: 'Informacje o praktykach zawodowych' },
  { label: 'Erasmus', query: 'Jak wziąć udział w programie Erasmus?' },
  { label: 'Harmonogram', query: 'Harmonogram zajęć i egzaminów' },
  { label: 'Dokumenty', query: 'Jakie dokumenty są potrzebne?' },
  { label: 'Legitymacja', query: 'Jak uzyskać legitymację studencką?' },
  { label: 'Ubezpieczenie', query: 'Ubezpieczenie studentów' },
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

export function ChatWidget({ apiUrl, theme }: Props) {
  const [open, setOpen] = useState(false);
  const [faculty, setFaculty] = useState<string | null>(() =>
    localStorage.getItem('sum_faculty')
  );
  const [onboarding, setOnboarding] = useState(!localStorage.getItem('sum_faculty'));
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
    localStorage.setItem('sum_faculty', fid);
    setOnboarding(false);
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
      const res = await fetch(`${apiUrl}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          faculty_override: faculty,
        }),
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
    setOnboarding(true);
    setSessionId(null);
    setMessages([]);
  };

  const confidence = (c?: number) => {
    if (c === undefined || c === 0) return null;
    if (c >= 0.80) return 'high';
    if (c >= 0.60) return 'medium';
    return 'low';
  };

  const selectedFacultyLabel = FACULTIES.find(f => f.id === faculty)?.label;

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
                <button className={styles.facultyBtn} onClick={changeFaculty} title="Zmien wydzial">
                  {selectedFacultyLabel?.split(' ').slice(0, 3).join(' ')}
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Zamknij">×</button>
            </div>
          </div>

          {/* Onboarding */}
          {onboarding && (
            <div className={styles.onboarding}>
              <p className={styles.onboardingTitle}>Wybierz swoj wydzial lub filię:</p>
              {FACULTIES.map(f => (
                <button key={f.id} className={styles.facultyChoice} onClick={() => selectFaculty(f.id)}>
                  {f.label}
                </button>
              ))}
              <button className={styles.facultyChoice} onClick={() => selectFaculty('')}>
                Pytanie ogolne (bez wydzialu)
              </button>
            </div>
          )}

          {/* Messages */}
          {!onboarding && (
            <>
              <div className={styles.messages}>
                {messages.map(msg => (
                  <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                    <div className={styles.bubble}>
                      <p className={styles.messageText}>{msg.content}</p>

                      {/* Confidence note */}
                      {msg.confidence_note && (
                        <div className={`${styles.confidenceNote} ${styles[confidence(msg.final_answer_confidence) ?? '']}`}>
                          {msg.confidence_note}
                        </div>
                      )}

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
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

                      {msg.action_buttons && msg.action_buttons.length > 0 && (
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
                      {msg.suggested_questions && msg.suggested_questions.length > 0 && (
                        <div className={styles.sources}>
                          <span className={styles.sourcesLabel}>Mozesz tez zapytac:</span>
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
                ))}

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
                  {QUICK_ACTIONS.map(a => (
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
