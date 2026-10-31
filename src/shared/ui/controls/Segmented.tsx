/**
 * Сегментированный переключатель (выбор одного из нескольких вариантов).
 * @module shared/ui/controls/Segmented
 */

import React from 'react';
import cn from 'classnames';
import { Icon, type IconName } from '../icon/Icon';
import styles from './controls.module.scss';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Подпись группы для экранных дикторов */
  ariaLabel: string;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div className={cn(styles.segmented, className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cn(styles.segment, o.value === value && styles.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
