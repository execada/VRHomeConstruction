/**
 * Данные для аватара: инициалы и стабильный цвет фона по имени.
 * @module shared/lib/avatar
 */

const PALETTE = ['#7b8ea8', '#8a9a6b', '#b8543b', '#c9a96e', '#9a7b8e', '#6b8a8a'];

/** Инициалы: первые буквы двух первых слов (или частей почты). */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return '';
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0].slice(0, 1) + words[1].slice(0, 1);
  return letters.toUpperCase();
}

/** Цвет фона из палитры по хэшу имени. */
export function avatarColor(name: string | undefined): string {
  let hash = 0;
  for (const char of name ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
