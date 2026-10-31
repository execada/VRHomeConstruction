/**
 * Переключатель вкл/выкл (доступен с клавиатуры: Space/Enter).
 * @module shared/ui/controls/Toggle
 */

import React from 'react';
import cn from 'classnames';
import styles from './controls.module.scss';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, disabled }) => (
  <label className={styles.toggle}>
    <span>{label}</span>
    <input
      className={styles.hiddenInput}
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className={cn(styles.switch, checked && styles.switchOn)} aria-hidden />
  </label>
);
