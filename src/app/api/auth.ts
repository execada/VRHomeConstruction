/**
 * API авторизации и профиля: вход, регистрация с кодом из письма, текущий пользователь,
 * смена имени, смена почты с подтверждением кодом. Ответы сервера проверяются схемами.
 * @module app/api/auth
 */

import { api } from './client';
import { authResponseSchema, sendCodeResponseSchema, userSchema } from './schemas';
import type { User } from '@/features/user/types';

export { getStoredToken, setStoredToken, clearStoredToken } from './token';

export interface AuthResponse {
  user: User;
  token: string;
}

/** Ответ на запрос кода регистрации. */
export interface SendCodeResult {
  message: string;
  /** Токен заявки: без него код из письма не подтвердить (см. verifyCode). */
  token: string;
}

function toUser(raw: unknown): User {
  const u = userSchema.parse(raw);
  return { id: u.id, name: u.name, email: u.email, avatar: u.avatar ?? undefined, username: u.username, role: u.role };
}

function toAuthResponse(raw: unknown): AuthResponse {
  const res = authResponseSchema.parse(raw);
  return { user: toUser(res.user), token: res.token };
}

/** Вход по email и паролю — без кода подтверждения. */
export async function login(email: string, password: string): Promise<AuthResponse> {
  return toAuthResponse(await api.post<unknown>('/api/auth/login', { email, password }));
}

/** Регистрация, шаг 1: код подтверждения на email и токен заявки. */
export async function sendCode(email: string, payload: { name: string; password: string }): Promise<SendCodeResult> {
  return sendCodeResponseSchema.parse(
    await api.post<unknown>('/api/auth/send-code', { email, purpose: 'register', ...payload }),
  );
}

/**
 * Регистрация, шаг 2: код из письма и токен заявки из шага 1 создают аккаунт.
 * @param email - почта из шага 1
 * @param code - 6 цифр из письма
 * @param token - токен из ответа sendCode (привязывает подтверждение к этой заявке)
 */
export async function verifyCode(email: string, code: string, token: string): Promise<AuthResponse> {
  return toAuthResponse(await api.post<unknown>('/api/auth/verify-code', { email, code, purpose: 'register', token }));
}

export async function fetchMe(): Promise<User> {
  return toUser(await api.get<unknown>('/api/auth/me'));
}

/** Сменить имя пользователя. */
export async function updateProfile(name: string): Promise<User> {
  return toUser(await api.patch<unknown>('/api/auth/me', { name }));
}

/**
 * Отправить код подтверждения на новую почту.
 * @param newEmail - новый адрес (на него уйдёт код)
 * @param password - текущий пароль: без него почту (а значит, аккаунт) не сменить
 */
export async function sendEmailChangeCode(newEmail: string, password: string): Promise<{ message: string }> {
  return api.post<{ message: string }>('/api/auth/email/send-code', { newEmail, password });
}

/** Подтвердить смену почты кодом из письма. */
export async function verifyEmailChange(newEmail: string, code: string): Promise<User> {
  const res = await api.post<{ user: unknown }>('/api/auth/email/verify', { newEmail, code });
  return toUser(res.user);
}
