/**
 * Текстовое поле с подписью, подсказкой и сообщением об ошибке (однострочное или многострочное).
 * @module shared/ui/controls/TextField
 */

import React, { useId } from 'react';
import cn from 'classnames';
import styles from './controls.module.scss';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  autoFocus?: boolean;
  maxLength?: number;
  multiline?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const TextField: React.FC<TextFieldProps> = ({ label, value, onChange, error, hint, multiline, type = 'text', ...rest }) => {
  const id = useId();
  const describedBy = error || hint ? `${id}-note` : undefined;
  const common = {
    id,
    value,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    ...rest,
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={cn(styles.inputWrap, multiline && styles.inputWrapMultiline, error && styles.inputInvalid)}>
        {multiline ? (
          <textarea className={cn(styles.input, styles.textarea)} rows={3} {...common} />
        ) : (
          <input className={styles.input} type={type} {...common} />
        )}
      </div>
      {(error || hint) && (
        <span id={describedBy} className={cn(styles.note, error && styles.noteError)} role={error ? 'alert' : undefined}>
          {error || hint}
        </span>
      )}
    </div>
  );
};
