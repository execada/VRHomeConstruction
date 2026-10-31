import { describe, expect, it } from 'vitest';
import { parseTags, validateProjectMeta } from './projectMeta';

describe('parseTags', () => {
  it('разделяет по запятым, убирает # и повторы без учёта регистра', () => {
    expect(parseTags('кухня, Лофт ,#светлый, лофт,, ')).toEqual(['кухня', 'Лофт', 'светлый']);
  });

  it('понимает точку с запятой и переносы строк, схлопывает пробелы', () => {
    expect(parseTags('скандинавский   стиль;минимализм\nуют')).toEqual(['скандинавский стиль', 'минимализм', 'уют']);
  });

  it('пустая строка — нет тегов', () => {
    expect(parseTags('  ')).toEqual([]);
  });
});

describe('validateProjectMeta', () => {
  it('нормализует корректные данные', () => {
    const result = validateProjectMeta({ name: '  Гостиная ', description: ' Светлая ', tags: 'уют, лофт' });
    expect(result).toEqual({ ok: true, value: { name: 'Гостиная', description: 'Светлая', tags: ['уют', 'лофт'] } });
  });

  it('возвращает ошибки по полям', () => {
    const result = validateProjectMeta({
      name: ' ',
      description: 'я'.repeat(501),
      tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(','),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBe('Введите название');
      expect(result.errors.description).toContain('500');
      expect(result.errors.tags).toContain('10');
    }
  });

  it('слишком длинный тег', () => {
    const result = validateProjectMeta({ name: 'x', description: '', tags: 'a'.repeat(33) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.tags).toContain('32');
  });
});
