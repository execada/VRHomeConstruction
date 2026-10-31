/**
 * Секция панели свойств: заголовок + содержимое, необязательное действие справа.
 * @module shared/ui/controls/Section
 */

import React from 'react';
import styles from './controls.module.scss';

interface SectionProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, action, children }) => (
  <section className={styles.section}>
    <header className={styles.sectionHeader}>
      <span>{title}</span>
      {action}
    </header>
    {children}
  </section>
);

/** Строка полей в сетке. */
export const FieldRow: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={styles.row}>{children}</div>;
