import React, { useEffect, useState } from 'react';
import styles from './TablePage.module.css';

interface UnansweredItem {
  id: string;
  session_id: string;
  message: string;
  retrieval_confidence: number;
  created_at: string;
}

export default function Unanswered(): React.ReactElement {
  const [items, setItems] = useState<UnansweredItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/unanswered')
      .then((r) => r.json())
      .then((data) => setItems(data as UnansweredItem[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>Pytania bez odpowiedzi</h1>
      <p className={styles.pageDesc}>
        Pytania, na które bot odpowiedział fallbackiem (retrieval_confidence &lt; 0.55).
      </p>
      {loading ? (
        <div className={styles.loading}>Ładowanie...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>Brak danych. 🎉</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pytanie</th>
              <th>Confidence</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.message}</td>
                <td>
                  <span className={styles.badgeRed}>
                    {(item.retrieval_confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td>{new Date(item.created_at).toLocaleDateString('pl')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
