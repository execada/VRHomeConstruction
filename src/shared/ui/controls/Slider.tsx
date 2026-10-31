/**
 * Слайдер с подписью и текущим значением.
 * @module shared/ui/controls/Slider
 */

import React, { useId } from 'react';
import styles from './controls.module.scss';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Подпись значения (по умолчанию — само число) */
  format?: (value: number) => string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 0.01, onChange, format, disabled }) => {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        <span>{label}</span>
        <span className={styles.labelValue}>{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
};
