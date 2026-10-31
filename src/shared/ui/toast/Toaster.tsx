/**
 * Контейнер тостов. Монтируется один раз в App.
 * @module shared/ui/toast/Toaster
 */

import React, { useEffect, useState } from 'react';
import { subscribeToasts, toast, type ToastItem } from '@/shared/lib/toast';
import styles from './Toaster.module.scss';

const ICON: Record<ToastItem['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'i',
};

export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} onClick={() => toast.dismiss(t.id)}>
          <span className={styles.icon}>{ICON[t.type]}</span>
          <span className={styles.msg}>{t.message}</span>
        </div>
      ))}
    </div>
  );
};
