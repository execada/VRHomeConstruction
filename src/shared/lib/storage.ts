/**
 * Безопасная работа с localStorage: чтение с проверкой схемы и запись без исключений.
 * localStorage может быть недоступен (приватный режим, квота, SSR/тесты) — тогда
 * возвращается значение по умолчанию, а запись тихо пропускается с предупреждением.
 * @module shared/lib/storage
 */

import type { z } from 'zod';

const PREFIX = 'vrhc:';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Прочитать значение и проверить его схемой.
 * @param key - ключ без префикса
 * @param schema - схема Zod
 * @param fallback - значение, если данных нет или они повреждены
 */
export function readStored<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  const ls = storage();
  if (!ls) return fallback;
  try {
    const raw = ls.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/** Записать значение (ошибки квоты не прерывают работу). */
export function writeStored(key: string, value: unknown): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Не удалось сохранить настройки «${key}»`, error);
  }
}
