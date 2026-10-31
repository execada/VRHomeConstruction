/**
 * Русское склонение существительного после числа: 1 проект, 2 проекта, 5 проектов.
 * @module shared/lib/plural
 */

/**
 * @param count - число
 * @param forms - формы для 1, 2–4 и 5+ («проект», «проекта», «проектов»)
 */
export function pluralize(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  const lastTwo = n % 100;
  const last = n % 10;
  const form = lastTwo >= 11 && lastTwo <= 14 ? forms[2] : last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
  return `${count} ${form}`;
}
