/**
 * Полноэкранная загрузка (открытие редактора, загрузка проекта).
 * @module shared/ui/loader/PageLoader
 */

import React from 'react';
import styles from './pageLoader.module.scss';

export const PageLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className={styles.loader} role="status">
    <span className={styles.spinner} aria-hidden="true" />
    {label}
  </div>
);
