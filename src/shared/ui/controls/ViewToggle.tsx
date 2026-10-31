/**
 * Переключатель вида списка: плитка или строки (Figma — две квадратные кнопки).
 * @module shared/ui/controls/ViewToggle
 */

import React from 'react';
import cn from 'classnames';
import { Icon } from '../icon/Icon';
import styles from './controls.module.scss';
import type { ViewMode } from './viewMode';

const OPTIONS: Array<{ value: ViewMode; label: string; icon: 'grid' | 'list' }> = [
  { value: 'grid', label: 'Плиткой', icon: 'grid' },
  { value: 'list', label: 'Списком', icon: 'list' },
];

export const ViewToggle: React.FC<{ value: ViewMode; onChange: (value: ViewMode) => void }> = ({ value, onChange }) => (
  <div className={styles.viewToggle} role="group" aria-label="Вид списка">
    {OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        className={cn(styles.viewToggleButton, value === option.value && styles.viewToggleActive)}
        aria-pressed={value === option.value}
        aria-label={option.label}
        title={option.label}
        onClick={() => onChange(option.value)}
      >
        <Icon name={option.icon} size={18} />
      </button>
    ))}
  </div>
);
