import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Unanswered from './pages/Unanswered';
import LowConfidence from './pages/LowConfidence';
import Sources from './pages/Sources';
import styles from './App.module.css';

type Page = 'dashboard' | 'unanswered' | 'low-confidence' | 'sources';

const NAV_ITEMS: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Pulpit', icon: '📊' },
  { key: 'unanswered', label: 'Bez odpowiedzi', icon: '❓' },
  { key: 'low-confidence', label: 'Niski confidence', icon: '⚠️' },
  { key: 'sources', label: 'Źródła wiedzy', icon: '📚' },
];

export default function App(): React.ReactElement {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🏥</span>
          <span className={styles.logoText}>SUM Chatbot</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem} ${page === item.key ? styles.navItemActive : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className={styles.main}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'unanswered' && <Unanswered />}
        {page === 'low-confidence' && <LowConfidence />}
        {page === 'sources' && <Sources />}
      </main>
    </div>
  );
}
