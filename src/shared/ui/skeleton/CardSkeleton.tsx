/**
 * Заглушки карточек на время загрузки списка (без «прыжка» вёрстки).
 * @module shared/ui/skeleton/CardSkeleton
 */

import React from 'react';
import styles from './skeleton.module.scss';

export const CardSkeletonGrid: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className={styles.grid} aria-busy="true" aria-label="Загрузка">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={styles.card}>
        <div className={styles.preview} />
        <div className={styles.lines}>
          <div className={styles.line} />
          <div className={styles.lineShort} />
        </div>
      </div>
    ))}
  </div>
);
