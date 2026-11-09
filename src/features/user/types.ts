/**
 * Типы фичи пользователя и авторизации.
 * @module user/types
 */

export interface User {
  id: string;
  name: string;
  /** Почта; у администратора, который входит по логину, может быть пустой. */
  email: string;
  avatar?: string;
  /** Логин для входа вместо почты (только у администратора). */
  username?: string;
  /** Роль: `admin` — администратор. */
  role?: string;
}

/** Вход, регистрация или восстановление пароля («Забыли пароль?»). */
export type AuthMode = 'login' | 'register' | 'reset';

/** Шаг формы: данные или ввод кода из письма */
export type AuthStep = 'form' | 'code';

export interface AuthForm {
  name: string;
  email: string;
  /** Пароль; при восстановлении — новый пароль. */
  password: string;
  /** Повтор нового пароля (только при восстановлении). */
  passwordRepeat: string;
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
