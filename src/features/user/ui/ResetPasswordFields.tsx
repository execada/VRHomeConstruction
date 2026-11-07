/**
 * Поля восстановления пароля: почта для кода, затем код из письма и новый пароль дважды.
 * @module user/ui/ResetPasswordFields
 */

import React from 'react';
import { TextField } from '@/shared/ui/controls';
import type { AuthForm } from '../types';
import styles from './authModal.module.scss';

type FieldChange = (field: keyof AuthForm, value: string) => void;

export const ResetEmailField: React.FC<{ form: AuthForm; disabled: boolean; onChange: FieldChange; onBack: () => void }> = ({
  form,
  disabled,
  onChange,
  onBack,
}) => (
  <>
    <TextField
      label="Почта"
      type="email"
      value={form.email}
      onChange={(v) => onChange('email', v)}
      placeholder="email@example.com"
      autoComplete="email"
      maxLength={254}
      hint="Пришлём 6-значный код, чтобы задать новый пароль"
      disabled={disabled}
      autoFocus
    />
    <button type="button" className={styles.link} onClick={onBack}>
      ← Вернуться ко входу
    </button>
  </>
);

interface ResetCodeFieldsProps {
  form: AuthForm;
  disabled: boolean;
  /** Секунд до повторной отправки кода (0 — можно отправить). */
  resendIn: number;
  onChange: FieldChange;
  onResend: () => void;
  onBack: () => void;
}

export const ResetCodeFields: React.FC<ResetCodeFieldsProps> = ({ form, disabled, resendIn, onChange, onResend, onBack }) => (
  <>
    <TextField
      label="Код из письма"
      value={form.code}
      onChange={(v) => onChange('code', v.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      hint={`6 цифр из письма на ${form.email}`}
      disabled={disabled}
      autoFocus
    />
    <TextField
      label="Новый пароль"
      type="password"
      value={form.password}
      onChange={(v) => onChange('password', v)}
      placeholder="Минимум 6 символов"
      autoComplete="new-password"
      maxLength={128}
      disabled={disabled}
    />
    <TextField
      label="Повторите пароль"
      type="password"
      value={form.passwordRepeat}
      onChange={(v) => onChange('passwordRepeat', v)}
      autoComplete="new-password"
      maxLength={128}
      hint="После смены пароля аккаунт выйдет на всех устройствах — войдите заново"
      disabled={disabled}
    />
    <div className={styles.links}>
      <button type="button" className={styles.link} onClick={onResend} disabled={disabled || resendIn > 0}>
        {resendIn > 0 ? `Отправить код снова через ${resendIn} с` : 'Отправить код снова'}
      </button>
      <button type="button" className={styles.link} onClick={onBack}>
        ← Изменить почту
      </button>
    </div>
  </>
);
