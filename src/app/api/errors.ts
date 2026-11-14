/**
 * Понятные пользователю тексты ошибок API: сервер отвечает короткими английскими
 * кодами, в интерфейсе показываем русский текст без технических деталей.
 * @module app/api/errors
 */

import { ApiRequestError } from './client';

/**
 * Единственное сообщение о конце сессии: его показывает сага пользователя при выходе, им же
 * отвечает apiErrorText на любой запрос, отклонённый из-за конца сессии.
 */
export const SESSION_ENDED_TEXT = 'Сессия завершена — войдите снова';

const KNOWN_MESSAGES: Record<string, string> = {
  unauthorized: SESSION_ENDED_TEXT,
  'authorization required': 'Войдите в аккаунт, чтобы продолжить',
  'invalid or expired token': SESSION_ENDED_TEXT,
  'email already registered': 'Эта почта уже зарегистрирована',
  'user not found': 'Пользователь не найден',
  'invalid email or password': 'Неверная почта или пароль',
  'invalid verification code': 'Неверный код подтверждения',
  'verification code expired, request a new one': 'Срок действия кода истёк — запросите новый',
  'code was sent recently, wait 30 seconds before retrying': 'Код уже отправлен — повторить можно через 30 секунд',
  'too many invalid attempts, request a new code': 'Слишком много попыток — запросите новый код',
  'too many requests, slow down': 'Слишком много запросов — попробуйте чуть позже',
  'email send failed': 'Не удалось отправить письмо, попробуйте позже',
  'invalid email': 'Некорректный адрес почты',
  'invalid name': 'Некорректное название',
  'invalid description': 'Описание слишком длинное',
  'invalid tags': 'Проверьте теги: не больше 10, каждый до 32 символов',
  'request body too large': 'Проект слишком большой для сохранения',
  'project not found': 'Проект не найден или был удалён',
  'layout not found': 'Шаблон не найден или был удалён',
  'folder not found': 'Папка не найдена или была удалена',
  'password must be at least 6 characters': 'Пароль должен быть не короче 6 символов',
  'password must be at most 72 bytes': 'Пароль слишком длинный',
  'invalid password': 'Неверный пароль',
  'too many login attempts, try again later': 'Слишком много неудачных попыток — попробуйте через 15 минут',
  'too many password reset attempts, try again later': 'Слишком много неверных кодов — попробуйте через час',
  'name is required': 'Введите имя',
  'invalid email format': 'Введите корректный адрес почты',
  'folder cannot be its own parent': 'Папку нельзя вложить в саму себя',
  'folder cannot be moved into its own subfolder': 'Нельзя переместить папку в её же подпапку',
  'parent folder not found': 'Папка, в которую вы перемещаете, не найдена — обновите страницу',
  'request body is required': 'Некорректный запрос — обновите страницу и попробуйте снова',
  'invalid json body': 'Некорректный запрос — обновите страницу и попробуйте снова',
  'internal server error': 'Сервер временно недоступен, попробуйте позже',
};

/** Поля формы из ответа «invalid field: <имя>». */
const FIELD_MESSAGES: Record<string, string> = {
  email: 'Введите корректный адрес почты',
  newemail: 'Введите корректный адрес почты',
  code: 'Код — 6 цифр из письма',
  token: 'Запросите код подтверждения ещё раз',
  password: 'Введите пароль',
  name: 'Введите название',
};

/** Ответы с параметрами (лимиты, имена полей): шаблон → русский текст. */
const PATTERN_MESSAGES: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [/^invalid field: (\w+)$/, (m) => FIELD_MESSAGES[m[1]] ?? 'Проверьте заполнение формы'],
  [/^name must be between 1 and (\d+) characters$/, (m) => `Название — от 1 до ${m[1]} символов`],
  [/^description must be at most (\d+) characters$/, (m) => `Описание — не длиннее ${m[1]} символов`],
  [/^project limit of (\d+) reached/, (m) => `Достигнут лимит в ${m[1]} проектов — удалите ненужные`],
  [/^(each tag|tags must)/, () => 'Проверьте теги: не больше 10, каждый до 32 символов'],
  [/^camera pose/, () => 'Не удалось сохранить положение камеры — обновите страницу'],
  [/^(status|template|thumbnail) /, () => 'Не удалось сохранить проект — обновите страницу и попробуйте снова'],
  [/^(projectids|layoutids|childfolderids|invalid parentid)/, () => 'Не удалось сохранить папку — обновите страницу'],
];

/**
 * Русский текст для известного ответа сервера (если ответ известен).
 * @param message - текст ошибки сервера
 */
export function knownErrorText(message: string): string | undefined {
  const key = message.trim().toLowerCase();
  const known = KNOWN_MESSAGES[key];
  if (known) return known;
  for (const [pattern, text] of PATTERN_MESSAGES) {
    const match = key.match(pattern);
    if (match) return text(match);
  }
  return undefined;
}

/**
 * Запрос отклонён из-за конца сессии: из аккаунта уже вышли и сообщение показали, поэтому
 * своё сообщение об ошибке фиче показывать не нужно.
 * @param error - пойманная ошибка (любой тип)
 */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ApiRequestError && error.sessionEnded;
}

/**
 * Текст ошибки для интерфейса.
 * @param error - пойманная ошибка (любой тип)
 * @param fallback - текст по умолчанию для неизвестных ошибок
 */
export function apiErrorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.sessionEnded) return SESSION_ENDED_TEXT;
  // Сетевые ошибки (status 0) уже сформулированы клиентом по-русски.
  if (error.status === 0) return error.message;
  const known = knownErrorText(error.message);
  if (known) return known;
  if (error.status === 401) return 'Войдите в аккаунт, чтобы продолжить';
  if (error.status === 413) return KNOWN_MESSAGES['request body too large'];
  if (error.status === 429) return KNOWN_MESSAGES['too many requests, slow down'];
  if (error.status >= 500) return 'Сервер временно недоступен, попробуйте позже';
  return fallback;
}
