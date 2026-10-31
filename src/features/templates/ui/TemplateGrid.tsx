/**
 * Раздел галереи шаблонов: заголовок и плитка (или список) карточек.
 * @module templates/ui/TemplateGrid
 */

import React from 'react';
import cn from 'classnames';
import type { TemplateEntry } from '../lib/entries';
import { TemplateCard, type TemplateManageActions } from './TemplateCard';
import styles from './templateGrid.module.scss';

interface TemplateGridProps {
  title: string;
  entries: TemplateEntry[];
  onSelect: (entry: TemplateEntry) => void;
  disabled?: boolean;
  view?: 'grid' | 'list';
  /** Узкая сетка для модального окна */
  compact?: boolean;
  /** Меню своих шаблонов (переименовать, удалить) */
  manage?: TemplateManageActions;
}

export const TemplateGrid: React.FC<TemplateGridProps> = ({ title, entries, onSelect, disabled, view = 'grid', compact, manage }) => (
  <section className={styles.section} aria-label={title}>
    <h3 className={styles.title}>
      {title} <span className={styles.count}>{entries.length}</span>
    </h3>
    <div className={cn(styles.grid, view === 'list' && styles.list, compact && styles.compact)}>
      {entries.map((entry) => (
        <TemplateCard key={`${entry.kind}:${entry.id}`} entry={entry} onSelect={onSelect} disabled={disabled} view={view} manage={manage} />
      ))}
    </div>
  </section>
);
