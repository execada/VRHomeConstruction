/**
 * Диалог смены почты в два шага: новый адрес и текущий пароль → код из письма на новый
 * адрес. Пароль защищает аккаунт: по одному токену сессии почту не сменить.
 * Повторная отправка кода доступна через 30 секунд (как ограничение на сервере).
 * @module user/ui/ChangeEmailDialog
 */

import React, { useId, useState } from 'react';
import { useDispatch } from 'react-redux';
import { authApi } from '@/app/api';
import { ApiRequestError } from '@/app/api/client';
import { apiErrorText } from '@/app/api/errors';
import { toast } from '@/shared/lib/toast';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import { checkField, emailSchema, verificationCodeSchema } from '../lib/profileSchemas';
import { useCountdown } from '../lib/useCountdown';
import { actions } from '../slice';
import styles from './authModal.module.scss';

type Field = 'email' | 'password' | 'code';
type FieldError = { field: Field; text: string } | null;

/** Ответы сервера, относящиеся к паролю, показываются под полем пароля. */
const PASSWORD_ERRORS = new Set(['invalid password', 'too many login attempts, try again later']);

function errorField(err: unknown, fallback: Field): Field {
  return err instanceof ApiRequestError && PASSWORD_ERRORS.has(err.message.trim().toLowerCase()) ? 'password' : fallback;
}

export const ChangeEmailDialog: React.FC<{ currentEmail: string; onClose: () => void }> = ({ currentEmail, onClose }) => {
  const dispatch = useDispatch();
  const formId = useId();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<FieldError>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, startCountdown] = useCountdown();

  const errorFor = (field: Field) => (error?.field === field ? error.text : null);

  const run = async (task: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      console.error(failure, err);
      // На шаге кода видно только поле кода — ошибки показываем под ним.
      const field = step === 'email' ? errorField(err, 'email') : 'code';
      setError({ field, text: apiErrorText(err, failure) });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => {
    const checked = checkField(emailSchema, email);
    if (!checked.ok) return setError({ field: 'email', text: checked.error });
    if (checked.value === currentEmail.toLowerCase()) return setError({ field: 'email', text: 'Это ваш текущий адрес' });
    if (!password) return setError({ field: 'password', text: 'Введите текущий пароль' });
    return run(async () => {
      await authApi.sendEmailChangeCode(checked.value, password);
      setEmail(checked.value);
      setStep('code');
      startCountdown();
    }, 'Не удалось отправить код');
  };

  const confirm = () => {
    const checked = checkField(verificationCodeSchema, code);
    if (!checked.ok) return setError({ field: 'code', text: checked.error });
    return run(async () => {
      dispatch(actions.updateAuthData(await authApi.verifyEmailChange(email, checked.value)));
      toast.success('Почта изменена');
      onClose();
    }, 'Не удалось подтвердить код');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void (step === 'email' ? sendCode() : confirm());
  };

  return (
    <Dialog
      title="Сменить почту"
      onClose={onClose}
      actions={
        <>
          {step === 'code' && (
            <Button variant="ghost" disabled={busy || resendIn > 0} onClick={() => void sendCode()}>
              {resendIn > 0 ? `Отправить снова через ${resendIn} с` : 'Отправить код снова'}
            </Button>
          )}
          <Button type="submit" form={formId} variant="primary" disabled={busy}>
            {step === 'email' ? 'Получить код' : 'Подтвердить'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {step === 'email' ? (
          <>
            <TextField
              label="Новая почта"
              type="email"
              value={email}
              onChange={setEmail}
              error={errorFor('email')}
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Текущий пароль"
              type="password"
              value={password}
              onChange={setPassword}
              error={errorFor('password')}
              hint="Подтвердите, что это вы"
              autoComplete="current-password"
            />
          </>
        ) : (
          <TextField
            label="Код из письма"
            hint={`Мы отправили 6-значный код на ${email}`}
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            error={errorFor('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        )}
      </form>
    </Dialog>
  );
};
