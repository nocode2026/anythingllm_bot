import React, { useEffect, useState } from 'react';
import styles from './TablePage.module.css';

interface LowConfItem {
  id: string;
  message: string;
  retrieval_confidence: number;
  final_answer_confidence: number;
  created_at: string;
}

export default function LowConfidence(): React.ReactElement {
  const [items, setItems] = useState<LowConfItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/low-confidence')
      .then((r) => r.json())
      .then((data) => setItems(data as LowConfItem[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>Niski confidence</h1>
      <p className={styles.pageDesc}>
        Pytania z odpowiedzią ostrzegawczą (0.55–0.74 retrieval lub 0.60–0.79 final).
      </p>
      {loading ? (
        <div className={styles.loading}>Ładowanie...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>Brak danych.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pytanie</th>
              <th>Retrieval conf.</th>
              <th>Final conf.</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.message}</td>
                <td>
                  <span className={styles.badgeYellow}>
                    {(item.retrieval_confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td>
                  <span className={styles.badgeYellow}>
                    {(item.final_answer_confidence * 100).toFixed(0)}%
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
