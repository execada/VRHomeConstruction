/**
 * Пустое состояние списка: иллюстрация, заголовок, пояснение и действия.
 * @module shared/ui/empty-state/EmptyState
 */

import React from 'react';
import styles from './emptyState.module.scss';

interface EmptyStateProps {
  title: string;
  text?: string;
  illustration?: React.ReactNode;
  actions?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, text, illustration, actions }) => (
  <div className={styles.empty} role="status">
    {illustration && <div className={styles.illustration}>{illustration}</div>}
    <h2 className={styles.title}>{title}</h2>
    {text && <p className={styles.text}>{text}</p>}
    {actions && <div className={styles.actions}>{actions}</div>}
  </div>
);
