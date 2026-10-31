/**
 * Числовое поле с единицами измерения. Значение применяется по Enter или при потере фокуса,
 * проверяется диапазоном; некорректный ввод подсвечивается и не применяется.
 * Отображаемая единица может отличаться от внутренней (например, см при хранении в метрах).
 * @module shared/ui/controls/NumberField
 */

import React, { useEffect, useId, useState } from 'react';
import cn from 'classnames';
import styles from './controls.module.scss';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Подпись единицы (м, см, °) */
  unit?: string;
  /** Множитель отображения: показываем value * scale (например, 100 для см) */
  scale?: number;
  /** Знаков после запятой */
  precision?: number;
  disabled?: boolean;
}

const format = (value: number, scale: number, precision: number) => String(Number((value * scale).toFixed(precision)));

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  scale = 1,
  precision = 2,
  disabled,
}) => {
  const id = useId();
  const [text, setText] = useState(() => format(value, scale, precision));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(format(value, scale, precision));
    setInvalid(false);
  }, [value, scale, precision]);

  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setInvalid(true);
      return;
    }
    const next = Math.min(max, Math.max(min, parsed / scale));
    setInvalid(false);
    setText(format(next, scale, precision));
    if (Math.abs(next - value) > 1e-9) onChange(next);
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={cn(styles.inputWrap, invalid && styles.inputInvalid)}>
        <input
          id={id}
          className={styles.input}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={invalid}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setText(format(value, scale, precision));
          }}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  );
};
