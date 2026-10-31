/**
 * Поиск по тексту в интерфейсе: без учёта регистра, «ё» и лишних пробелов.
 * @module shared/lib/search
 */

/** Нормализация строки для сравнения. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Содержит ли хотя бы одно из полей строку запроса. Пустой запрос подходит всем.
 * @param fields - поля записи (название, описание, теги…)
 * @param query - строка поиска
 */
export function matchesQuery(fields: ReadonlyArray<string | undefined>, query: string): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(fields.filter(Boolean).join(' ')).includes(needle);
}
