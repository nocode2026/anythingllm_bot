import React, { useEffect, useState, useCallback } from 'react';
import styles from './Dashboard.module.css';

interface Stats {
  total_chunks: number;
  total_sources: number;
  total_sessions: number;
  total_messages: number;
  answered_questions: number;
  fallback_questions: number;
  coverage_score: number;
  avg_retrieval_confidence: number;
}

interface ReindexStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress?: number;
  total?: number;
  message?: string;
}

export default function Dashboard(): React.ReactElement {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexJob, setReindexJob] = useState<ReindexStatus | null>(null);
  const [reindexPolling, setReindexPolling] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const startReindex = async (): Promise<void> => {
    const res = await fetch('/api/admin/reindex', { method: 'POST' });
    if (!res.ok) return;
    const data = (await res.json()) as { job_id: string };
    setReindexJob({ job_id: data.job_id, status: 'pending' });
    setReindexPolling(true);
  };

  useEffect(() => {
    if (!reindexPolling || !reindexJob) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/admin/reindex/${reindexJob.job_id}`);
      if (!res.ok) return;
      const status = (await res.json()) as ReindexStatus;
      setReindexJob(status);
      if (status.status === 'done' || status.status === 'error') {
        setReindexPolling(false);
        void fetchStats();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [reindexPolling, reindexJob, fetchStats]);

  if (loading) return <div className={styles.loading}>Ładowanie...</div>;

  const coverage = stats ? Math.round(stats.coverage_score * 100) : 0;
  const avgConf = stats ? Math.round(stats.avg_retrieval_confidence * 100) : 0;

  return (
    <div>
      <h1 className={styles.pageTitle}>Pulpit</h1>

      {stats && (
        <div className={styles.grid}>
          <StatCard label="Fragmenty wiedzy" value={stats.total_chunks.toLocaleString('pl')} icon="📄" />
          <StatCard label="Źródła" value={stats.total_sources.toLocaleString('pl')} icon="🌐" />
          <StatCard label="Sesje" value={stats.total_sessions.toLocaleString('pl')} icon="💬" />
          <StatCard label="Wiadomości" value={stats.total_messages.toLocaleString('pl')} icon="✉️" />
          <StatCard
            label="Pokrycie odpowiedzi"
            value={`${coverage}%`}
            icon="✅"
            badge={coverage >= 80 ? 'green' : coverage >= 60 ? 'yellow' : 'red'}
          />
          <StatCard
            label="Śr. confidence retrieval"
            value={`${avgConf}%`}
            icon="📈"
            badge={avgConf >= 70 ? 'green' : avgConf >= 50 ? 'yellow' : 'red'}
          />
        </div>
      )}

      <div className={styles.reindexSection}>
        <h2 className={styles.sectionTitle}>Reindeksacja</h2>
        <p className={styles.sectionDesc}>
          Uruchom pełną reindeksację bazy wiedzy z WordPress REST API.
          Poprzednie dane zostaną zastąpione.
        </p>
        <button
          className={styles.reindexBtn}
          onClick={() => void startReindex()}
          disabled={reindexPolling}
        >
          {reindexPolling ? '⏳ Reindeksacja w toku...' : '🔄 Uruchom reindeksację'}
        </button>

        {reindexJob && (
          <div className={`${styles.jobStatus} ${styles[`job_${reindexJob.status}`]}`}>
            <strong>Job {reindexJob.job_id.slice(0, 8)}</strong>
            {' — '}
            {reindexJob.status === 'running' && reindexJob.total
              ? `${reindexJob.progress ?? 0}/${reindexJob.total} stron`
              : reindexJob.status}
            {reindexJob.message && ` — ${reindexJob.message}`}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  badge,
}: {
  label: string;
  value: string;
  icon: string;
  badge?: 'green' | 'yellow' | 'red';
}): React.ReactElement {
  return (
    <div className={`${styles.card} ${badge ? styles[`card_${badge}`] : ''}`}>
      <div className={styles.cardIcon}>{icon}</div>
      <div className={styles.cardValue}>{value}</div>
      <div className={styles.cardLabel}>{label}</div>
    </div>
  );
}
