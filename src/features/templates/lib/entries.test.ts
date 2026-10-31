import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES } from './builtins';
import { filterTemplates, toBuiltinEntries, toLayoutEntries } from './entries';

describe('template entries', () => {
  const builtins = toBuiltinEntries(BUILTIN_TEMPLATES);
  const layouts = toLayoutEntries([
    { id: 'l1', name: 'Моя ёлочная гостиная', description: 'с камином', thumbnail: '' },
    { id: 'l2', name: 'Офис' },
  ]);

  it('встроенные шаблоны получают документ сцены и площадь', () => {
    expect(builtins).toHaveLength(BUILTIN_TEMPLATES.length);
    const living = builtins.find((e) => e.id === 'living');
    expect(living?.kind).toBe('builtin');
    expect(living?.meta).toBe('21 м²');
    if (living?.kind === 'builtin') expect(living.doc.furniture.length).toBeGreaterThan(0);
  });

  it('пользовательские шаблоны без описания и превью', () => {
    expect(layouts[1]).toMatchObject({ kind: 'layout', description: '', meta: 'Мой шаблон', thumbnail: undefined });
  });

  it('поиск игнорирует регистр, «ё» и ищет в описании', () => {
    const all = [...builtins, ...layouts];
    expect(filterTemplates(all, '  ').length).toBe(all.length);
    expect(filterTemplates(all, 'ЕЛОЧНАЯ').map((e) => e.id)).toEqual(['l1']);
    expect(filterTemplates(all, 'камин').map((e) => e.id)).toEqual(['l1']);
    expect(filterTemplates(all, 'перегородк').map((e) => e.id)).toEqual(['studio']);
  });
});
