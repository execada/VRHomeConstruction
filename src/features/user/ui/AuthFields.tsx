/**
 * Поля окна входа/регистрации: почта и пароль (и имя при регистрации) или код из письма.
 * При входе — ссылка «Забыли пароль?».
 * @module user/ui/AuthFields
 */

import React from 'react';
import { TextField } from '@/shared/ui/controls';
import type { AuthForm } from '../types';
import styles from './authModal.module.scss';

type FieldChange = (field: keyof AuthForm, value: string) => void;

interface CredentialsFieldsProps {
  form: AuthForm;
  isRegister: boolean;
  disabled: boolean;
  onChange: FieldChange;
  onSwitchMode: () => void;
  onForgotPassword: () => void;
}

export const CredentialsFields: React.FC<CredentialsFieldsProps> = ({ form, isRegister, disabled, onChange, onSwitchMode, onForgotPassword }) => (
  <>
    {isRegister && (
      <TextField label="Имя" value={form.name} onChange={(v) => onChange('name', v)} placeholder="Ваше имя" autoComplete="name" maxLength={60} disabled={disabled} autoFocus />
    )}
    <TextField
      label={isRegister ? 'Почта' : 'Почта или логин'}
      type={isRegister ? 'email' : 'text'}
      value={form.email}
      onChange={(v) => onChange('email', v)}
      placeholder={isRegister ? 'email@example.com' : 'email@example.com или логин'}
      autoComplete={isRegister ? 'email' : 'username'}
      maxLength={254}
      disabled={disabled}
      autoFocus={!isRegister}
    />
    <TextField
      label="Пароль"
      type="password"
      value={form.password}
      onChange={(v) => onChange('password', v)}
      placeholder={isRegister ? 'Минимум 6 символов' : 'Пароль'}
      autoComplete={isRegister ? 'new-password' : 'current-password'}
      maxLength={128}
      hint={isRegister ? 'На почту придёт 6-значный код для подтверждения' : undefined}
      disabled={disabled}
    />
    {!isRegister && (
      <button type="button" className={styles.link} onClick={onForgotPassword}>
        Забыли пароль?
      </button>
    )}
    <p className={styles.switchMode}>
      {isRegister ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
      <button type="button" className={styles.link} onClick={onSwitchMode}>
        {isRegister ? 'Войти' : 'Зарегистрироваться'}
      </button>
    </p>
  </>
);

export const CodeField: React.FC<{ form: AuthForm; codeSent: boolean; disabled: boolean; onChange: FieldChange; onBack: () => void }> = ({
  form,
  codeSent,
  disabled,
  onChange,
  onBack,
}) => (
  <>
    <TextField
      label="Код из письма"
      value={form.code}
      onChange={(v) => onChange('code', v.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      hint={codeSent ? `Код отправлен на ${form.email}. Проверьте почту и папку «Спам».` : undefined}
      disabled={disabled}
      autoFocus
    />
    <button type="button" className={styles.link} onClick={onBack}>
      ← Изменить почту или пароль
    </button>
  </>
);
