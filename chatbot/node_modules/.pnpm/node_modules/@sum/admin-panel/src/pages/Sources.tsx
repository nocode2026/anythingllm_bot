import React, { useEffect, useState } from 'react';
import styles from './TablePage.module.css';

interface Source {
  id: string;
  name: string;
  url: string;
  scope: string;
  faculty_id: string | null;
  chunk_count: number;
  last_ingested_at: string | null;
  status: 'active' | 'error' | 'pending';
}

export default function Sources(): React.ReactElement {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/sources')
      .then((r) => r.json())
      .then((data) => setSources(data as Source[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>Źródła wiedzy</h1>
      <p className={styles.pageDesc}>
        Lista wszystkich indeksowanych źródeł z liczbą fragmentów i datą ostatniej indeksacji.
      </p>
      {loading ? (
        <div className={styles.loading}>Ładowanie...</div>
      ) : sources.length === 0 ? (
        <div className={styles.empty}>Brak źródeł — uruchom ingestion.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Zakres</th>
              <th>Wydział</th>
              <th>Fragmenty</th>
              <th>Status</th>
              <th>Ostatnia indeksacja</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer" className={styles.link}>
                    {s.name}
                  </a>
                </td>
                <td>
                  <span className={styles.badgeNeutral}>{s.scope}</span>
                </td>
                <td>{s.faculty_id ?? '—'}</td>
                <td>{s.chunk_count}</td>
                <td>
                  <span
                    className={
                      s.status === 'active'
                        ? styles.badgeGreen
                        : s.status === 'error'
                        ? styles.badgeRed
                        : styles.badgeYellow
                    }
                  >
                    {s.status}
                  </span>
                </td>
                <td>
                  {s.last_ingested_at
                    ? new Date(s.last_ingested_at).toLocaleDateString('pl')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
