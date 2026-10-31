import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeSearch } from './search';

describe('search', () => {
  it('normalizeSearch убирает регистр, «ё» и лишние пробелы', () => {
    expect(normalizeSearch('  Ёлка   и  ЕЛЬ ')).toBe('елка и ель');
  });

  it('matchesQuery ищет по всем полям и пропускает пустые', () => {
    expect(matchesQuery(['Гостиная', undefined, 'уют'], 'УЮТ')).toBe(true);
    expect(matchesQuery(['Гостиная'], 'кухня')).toBe(false);
    expect(matchesQuery(['Гостиная'], '   ')).toBe(true);
  });

  it('совпадение не склеивает соседние поля в одно слово', () => {
    expect(matchesQuery(['кух', 'ня'], 'кухня')).toBe(false);
  });
});
