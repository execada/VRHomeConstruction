/**
 * Карточка шаблона (Figma «Шаблоны»): превью, значок шаблона, название и описание.
 * Встроенные шаблоны показывают настоящий план комнаты, пользовательские — сохранённое превью;
 * у своих шаблонов может быть меню (переименовать, удалить).
 * @module templates/ui/TemplateCard
 */

import React, { memo } from 'react';
import cn from 'classnames';
import { IconButton } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { IsometricRoom } from '@/shared/ui/illustrations/IsometricRoom';
import { Menu } from '@/shared/ui/overlay/Menu';
import type { TemplateEntry } from '../lib/entries';
import { ScenePlanPreview } from './ScenePlanPreview';
import styles from './templateCard.module.scss';

/** Управление своими шаблонами (только на странице «Шаблоны»). */
export interface TemplateManageActions {
  rename: (entry: TemplateEntry) => void;
  remove: (entry: TemplateEntry) => void;
}

interface TemplateCardProps {
  entry: TemplateEntry;
  onSelect: (entry: TemplateEntry) => void;
  disabled?: boolean;
  view?: 'grid' | 'list';
  manage?: TemplateManageActions;
}

const Preview: React.FC<{ entry: TemplateEntry }> = ({ entry }) => {
  if (entry.kind === 'builtin') return <ScenePlanPreview doc={entry.doc} className={styles.plan} />;
  if (entry.thumbnail) return <img src={entry.thumbnail} alt="" className={styles.image} loading="lazy" />;
  return <IsometricRoom furnished className={styles.illustration} />;
};

const Corner: React.FC<{ entry: TemplateEntry; manage?: TemplateManageActions }> = ({ entry, manage }) => {
  if (manage && entry.kind === 'layout') {
    return (
      <div className={styles.corner}>
        <Menu
          trigger={(props) => <IconButton icon="more" label="Действия с шаблоном" size="sm" className={styles.cornerButton} {...props} />}
          items={[
            { label: 'Переименовать', icon: 'pencil', onSelect: () => manage.rename(entry) },
            { label: 'Удалить шаблон', icon: 'trash', danger: true, separated: true, onSelect: () => manage.remove(entry) },
          ]}
        />
      </div>
    );
  }
  return (
    <span className={cn(styles.corner, styles.badge)} title={entry.kind === 'builtin' ? 'Встроенный шаблон' : 'Мой шаблон'}>
      <Icon name={entry.kind === 'builtin' ? 'cube' : 'user'} size={14} />
    </span>
  );
};

export const TemplateCard: React.FC<TemplateCardProps> = memo(({ entry, onSelect, disabled, view = 'grid', manage }) => (
  <article className={cn(styles.card, view === 'list' && styles.cardList)}>
    <button
      type="button"
      className={styles.select}
      onClick={() => onSelect(entry)}
      disabled={disabled}
      aria-label={`Создать проект из шаблона «${entry.name}»`}
    >
      <span className={styles.preview}>
        <Preview entry={entry} />
      </span>
      <span className={styles.info}>
        <span className={styles.name}>{entry.name}</span>
        <span className={styles.description}>{entry.description || entry.meta}</span>
        {entry.description && <span className={styles.meta}>{entry.meta}</span>}
      </span>
    </button>
    <Corner entry={entry} manage={manage} />
  </article>
));
