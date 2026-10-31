/**
 * Форматирование времени для интерфейса: «только что», «5 мин назад», «вчера», «12 окт.».
 * @module shared/lib/time
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const yearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Относительное время события.
 * @param iso - время события (ISO-строка); некорректное значение даёт пустую строку
 * @param now - текущее время (для тестов)
 */
export function formatRelativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';
  const diff = now.getTime() - time;
  if (diff < MINUTE) return 'только что';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} мин назад`;
  if (startOfDay(date) === startOfDay(now)) return `${Math.floor(diff / HOUR)} ч назад`;
  if (startOfDay(now) - startOfDay(date) <= 24 * HOUR) return 'вчера';
  return date.getFullYear() === now.getFullYear() ? dayFormat.format(date) : yearFormat.format(date);
}
