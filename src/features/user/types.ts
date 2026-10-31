/**
 * Типы фичи пользователя и авторизации.
 * @module user/types
 */

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export type AuthMode = 'login' | 'register';

/** Шаг формы: данные или ввод кода из письма */
export type AuthStep = 'form' | 'code';

export interface AuthForm {
  name: string;
  email: string;
  password: string;
  code: string;
}

export interface UserState {
  authData?: User;
  isAuth: boolean;
  isLoading: boolean;
  error?: string;
  isAuthModalOpen: boolean;
  authMode: AuthMode;
  authStep: AuthStep;
  codeSent: boolean;
  successMessage?: string;
  form: AuthForm;
  /** Токен заявки на регистрацию из ответа на отправку кода (нужен для подтверждения). */
  registrationToken?: string;
}
