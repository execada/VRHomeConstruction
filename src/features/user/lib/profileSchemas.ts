/**
 * Проверка полей профиля перед отправкой на сервер (те же ограничения, что на бэкенде).
 * @module user/lib/profileSchemas
 */

import { z } from 'zod';

/** Имя пользователя: 1–60 символов без пробелов по краям. */
export const userNameSchema = z.string().trim().min(1, 'Введите имя').max(60, 'Имя — не длиннее 60 символов');

/** Почта: корректный адрес до 254 символов, хранится в нижнем регистре. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Адрес почты слишком длинный')
  .pipe(z.email('Введите корректный адрес почты'));

/** Код подтверждения из письма: 6 цифр. */
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Код — 6 цифр из письма');

type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Проверить значение схемой и вернуть первую ошибку понятным текстом.
 * @param schema - схема поля
 * @param value - введённое значение
 */
export function checkField<T>(schema: z.ZodType<T>, value: unknown): FieldResult<T> {
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Некорректное значение' };
}
