/**
 * Выбор цвета: системная палитра + HEX-поле с проверкой формата.
 * @module shared/ui/controls/ColorField
 */

import React, { useEffect, useId, useState } from 'react';
import cn from 'classnames';
import { isHexColor } from '@/shared/lib/color/colorTemperature';
import styles from './controls.module.scss';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export const ColorField: React.FC<ColorFieldProps> = ({ label, value, onChange }) => {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = isHexColor(text);

  const commit = () => {
    if (valid && text.toLowerCase() !== value.toLowerCase()) onChange(text.toLowerCase());
    if (!valid) setText(value);
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.color}>
        <input
          className={styles.swatch}
          type="color"
          value={isHexColor(value) ? value : '#ffffff'}
          aria-label={`${label}: палитра`}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className={cn(styles.inputWrap, !valid && styles.inputInvalid)} style={{ flex: 1 }}>
          <input
            id={id}
            className={styles.input}
            value={text}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!valid}
            onChange={(e) => setText(e.target.value.trim())}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        </div>
      </div>
    </div>
  );
};
