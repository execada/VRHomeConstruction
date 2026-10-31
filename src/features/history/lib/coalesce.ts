/**
 * Правила склейки изменений в один шаг истории.
 * Перетаскивание порождает десятки действий в секунду — пользователь ожидает,
 * что Ctrl+Z отменит перетаскивание целиком, а не последний кадр.
 * @module history/lib/coalesce
 */

/** Сколько шагов истории хранится. */
export const HISTORY_LIMIT = 60;
/** Окно склейки повторяющихся изменений одного объекта, мс. */
export const SAME_TARGET_WINDOW_MS = 700;
/** Окно склейки пачки программных действий (одна операция пользователя), мс. */
export const BURST_WINDOW_MS = 120;

/** Последнее записанное изменение. */
export interface ChangeMark {
  key: string;
  time: number;
  /** Номер жеста пользователя (перетаскивание, поворот), если изменение сделано жестом */
  gesture?: number;
}

/** Ключ изменения: тип действия + объект, к которому оно относится. */
export function changeKey(action: { type: string; payload?: unknown }): string {
  const p = action.payload as Record<string, unknown> | string | undefined;
  if (typeof p === 'string') return `${action.type}:${p}`;
  const nested = (p?.opening as { id?: string } | undefined)?.id;
  const target = p?.id ?? nested ?? p?.partitionId ?? p?.target ?? '';
  return `${action.type}:${String(target)}`;
}

/**
 * Нужно ли склеить изменение с предыдущим (не создавая новый шаг истории).
 * Во время жеста (перетаскивание, поворот) изменения того же объекта склеиваются
 * без ограничения по времени — пауза посреди перетаскивания не дробит отмену.
 * @param prev - предыдущее изменение (null — первое)
 * @param next - текущее изменение
 */
export function shouldCoalesce(prev: ChangeMark | null, next: ChangeMark): boolean {
  if (!prev) return false;
  const elapsed = next.time - prev.time;
  if (elapsed < 0) return false;
  if (next.gesture !== undefined && prev.gesture === next.gesture && prev.key === next.key) return true;
  return elapsed < BURST_WINDOW_MS || (prev.key === next.key && elapsed < SAME_TARGET_WINDOW_MS);
}

/** Добавить элемент в стек с ограничением длины. */
export function pushLimited<T>(stack: readonly T[], item: T, limit: number = HISTORY_LIMIT): T[] {
  return [...stack, item].slice(-limit);
}
