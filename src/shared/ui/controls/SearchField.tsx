/**
 * Поле поиска (Figma: «пилюля» с лупой) с кнопкой очистки.
 * @module shared/ui/controls/SearchField
 */

import React from 'react';
import { Icon } from '../icon/Icon';
import styles from './controls.module.scss';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Подпись для экранных дикторов */
  label?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({ value, onChange, placeholder = 'Поиск', label = 'Поиск' }) => (
  <div className={styles.search} role="search">
    <Icon name="search" size={18} className={styles.searchIcon} />
    <input
      type="search"
      className={styles.searchInput}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={100}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Escape' && value && onChange('')}
    />
    {value && (
      <button type="button" className={styles.searchClear} onClick={() => onChange('')} aria-label="Очистить поиск">
        <Icon name="close" size={16} />
      </button>
    )}
  </div>
);
