/**
 * Окно входа, регистрации и восстановления пароля: вход по почте и паролю, регистрация
 * с подтверждением кодом из письма, «Забыли пароль?» — код на почту и новый пароль.
 * Состояние и запросы — слайс и сага пользователя.
 * @module user/ui/AuthModal
 */

import React, { useEffect, useId } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { knownErrorText } from '@/app/api/errors';
import { Button } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import { useCountdown } from '../lib/useCountdown';
import { actions } from '../slice';
import { selectors } from '../selectors';
import type { AuthForm, AuthMode } from '../types';
import { CodeField, CredentialsFields } from './AuthFields';
import { ResetCodeFields, ResetEmailField } from './ResetPasswordFields';
import styles from './authModal.module.scss';

const TITLES: Record<AuthMode, string> = { login: 'Вход', register: 'Регистрация', reset: 'Восстановление пароля' };

function submitLabel(isLoading: boolean, mode: AuthMode, isCodeStep: boolean): string {
  if (mode === 'reset') {
    if (isCodeStep) return isLoading ? 'Сохранение…' : 'Сменить пароль';
    return isLoading ? 'Отправка…' : 'Получить код';
  }
  if (isCodeStep) return isLoading ? 'Проверка…' : 'Подтвердить и войти';
  if (mode === 'register') return isLoading ? 'Отправка…' : 'Получить код на почту';
  return isLoading ? 'Вход…' : 'Войти';
}

/** Запрос, который отправляет форма на текущем шаге. */
function submitAction(mode: AuthMode, isCodeStep: boolean) {
  if (mode === 'reset') return isCodeStep ? actions.resetPasswordRequested() : actions.sendResetCodeRequested();
  if (mode === 'register') return isCodeStep ? actions.verifyCodeRequested() : actions.sendCodeRequested();
  return actions.loginRequested();
}

type FieldChange = (field: keyof AuthForm, value: string) => void;

interface StepFieldsProps {
  mode: AuthMode;
  isCodeStep: boolean;
  form: AuthForm;
  codeSent: boolean;
  disabled: boolean;
  resendIn: number;
  onChange: FieldChange;
  onMode: (mode: AuthMode) => void;
  onBack: () => void;
  onResend: () => void;
}

/** Поля текущего режима и шага. */
const StepFields: React.FC<StepFieldsProps> = ({ mode, isCodeStep, form, codeSent, disabled, resendIn, onChange, onMode, onBack, onResend }) => {
  if (mode === 'reset') {
    return isCodeStep ? (
      <ResetCodeFields form={form} disabled={disabled} resendIn={resendIn} onChange={onChange} onResend={onResend} onBack={onBack} />
    ) : (
      <ResetEmailField form={form} disabled={disabled} onChange={onChange} onBack={() => onMode('login')} />
    );
  }
  if (isCodeStep) return <CodeField form={form} codeSent={codeSent} disabled={disabled} onChange={onChange} onBack={onBack} />;
  const isRegister = mode === 'register';
  return (
    <CredentialsFields
      form={form}
      isRegister={isRegister}
      disabled={disabled}
      onChange={onChange}
      onSwitchMode={() => onMode(isRegister ? 'login' : 'register')}
      onForgotPassword={() => onMode('reset')}
    />
  );
};

export const AuthModal = () => {
  const dispatch = useDispatch();
  const formId = useId();
  const isOpen = useSelector(selectors.selectIsAuthModalOpen);
  const mode = useSelector(selectors.selectAuthMode);
  const step = useSelector(selectors.selectAuthStep);
  const codeSent = useSelector(selectors.selectCodeSent);
  const form = useSelector(selectors.selectAuthForm);
  const isLoading = useSelector(selectors.selectUserIsLoading);
  const error = useSelector(selectors.selectUserError);
  const successMessage = useSelector(selectors.selectSuccessMessage);
  const [resendIn, startCountdown] = useCountdown();

  // Шаг с кодом бывает при регистрации и восстановлении пароля; вход — сразу по почте и паролю.
  const isCodeStep = mode !== 'login' && step === 'code';
  const isResetCodeStep = mode === 'reset' && isCodeStep;
  // Повторная отправка кода сброса — не раньше паузы сервера.
  useEffect(() => {
    if (isResetCodeStep) startCountdown();
  }, [isResetCodeStep, startCountdown]);

  if (!isOpen) return null;

  const onChange: FieldChange = (field, value) => dispatch(actions.setFormField({ field, value }));
  const close = () => dispatch(actions.closeAuthModal());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(submitAction(mode, isCodeStep));
  };

  const back = () => {
    dispatch(actions.setAuthStep('form'));
    dispatch(actions.setCodeSent(false));
    dispatch(actions.setFormField({ field: 'code', value: '' }));
    // Новый пароль вводится заново вместе с новым кодом.
    if (mode === 'reset') {
      dispatch(actions.setFormField({ field: 'password', value: '' }));
      dispatch(actions.setFormField({ field: 'passwordRepeat', value: '' }));
    }
  };

  const resend = () => {
    startCountdown();
    dispatch(actions.sendResetCodeRequested());
  };

  // Сообщение — после отправки кода и при входе после смены пароля.
  const notice = successMessage && (isCodeStep || mode === 'login') ? successMessage : undefined;

  return (
    <Dialog
      title={TITLES[mode]}
      onClose={close}
      actions={
        <>
          <Button onClick={close} disabled={isLoading}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={isLoading}>
            {submitLabel(isLoading, mode, isCodeStep)}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {knownErrorText(error) ?? error}
          </p>
        )}
        {notice && (
          <p className={styles.success} role="status">
            {notice}
          </p>
        )}
        <StepFields
          mode={mode}
          isCodeStep={isCodeStep}
          form={form}
          codeSent={codeSent}
          disabled={isLoading}
          resendIn={resendIn}
          onChange={onChange}
          onMode={(next) => dispatch(actions.setAuthMode(next))}
          onBack={back}
          onResend={resend}
        />
      </form>
    </Dialog>
  );
};
