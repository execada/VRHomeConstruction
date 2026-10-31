/**
 * Окно входа и регистрации (новый дизайн): вход по почте и паролю, регистрация
 * с подтверждением кодом из письма. Состояние и запросы — прежние слайс и сага пользователя.
 * @module user/ui/AuthModal
 */

import React, { useId } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { knownErrorText } from '@/app/api/errors';
import { Button } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import { actions } from '../slice';
import { selectors } from '../selectors';
import type { AuthForm } from '../types';
import { CodeField, CredentialsFields } from './AuthFields';
import styles from './authModal.module.scss';

function submitLabel(isLoading: boolean, isCodeStep: boolean, isRegister: boolean): string {
  if (isCodeStep) return isLoading ? 'Проверка…' : 'Подтвердить и войти';
  if (isRegister) return isLoading ? 'Отправка…' : 'Получить код на почту';
  return isLoading ? 'Вход…' : 'Войти';
}

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

  if (!isOpen) return null;

  const isRegister = mode === 'register';
  // Шаг с кодом бывает только при регистрации; вход — сразу по почте и паролю.
  const isCodeStep = isRegister && step === 'code';
  const onChange = (field: keyof AuthForm, value: string) => dispatch(actions.setFormField({ field, value }));
  const close = () => dispatch(actions.closeAuthModal());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeStep) dispatch(actions.verifyCodeRequested());
    else if (isRegister) dispatch(actions.sendCodeRequested());
    else dispatch(actions.loginRequested());
  };

  const back = () => {
    dispatch(actions.setAuthStep('form'));
    dispatch(actions.setCodeSent(false));
    dispatch(actions.setFormField({ field: 'code', value: '' }));
  };

  return (
    <Dialog
      title={isRegister ? 'Регистрация' : 'Вход'}
      onClose={close}
      actions={
        <>
          <Button onClick={close} disabled={isLoading}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={isLoading}>
            {submitLabel(isLoading, isCodeStep, isRegister)}
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
        {successMessage && isCodeStep && <p className={styles.success}>{successMessage}</p>}
        {isCodeStep ? (
          <CodeField form={form} codeSent={codeSent} disabled={isLoading} onChange={onChange} onBack={back} />
        ) : (
          <CredentialsFields
            form={form}
            isRegister={isRegister}
            disabled={isLoading}
            onChange={onChange}
            onSwitchMode={() => dispatch(actions.setAuthMode(isRegister ? 'login' : 'register'))}
          />
        )}
      </form>
    </Dialog>
  );
};
