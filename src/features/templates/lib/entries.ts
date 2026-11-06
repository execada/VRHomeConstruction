/**
 * Единый список шаблонов для выбора: встроенные (с планом-превью) и сохранённые пользователем.
 * @module templates/lib/entries
 */

import type { Layout } from '@/features/create-layout/types';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import { pluralize } from '@/shared/lib/plural';
import { matchesQuery } from '@/shared/lib/search';
import type { BuiltinTemplate } from './builtins';

/** Шаблон в галерее. */
export type TemplateEntry =
  | { kind: 'builtin'; id: string; name: string; description: string; meta: string; doc: SceneDocument }
  | { kind: 'layout'; id: string; name: string; description: string; meta: string; thumbnail?: string };

const areaFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Подпись площади и числа этажей. */
function builtinMeta(area: number, floors: number): string {
  const size = `${areaFormat.format(area)} м²`;
  return floors > 1 ? `${size} · ${pluralize(floors, ['этаж', 'этажа', 'этажей'])}` : size;
}

/** Встроенные шаблоны → записи галереи (документ строится сразу — нужен для превью). */
export function toBuiltinEntries(templates: BuiltinTemplate[]): TemplateEntry[] {
  return templates.map((t) => {
    const doc = t.build();
    return { kind: 'builtin', id: t.id, name: t.name, description: t.description, meta: builtinMeta(t.area, doc.floors.length), doc };
  });
}

/** Пользовательские шаблоны → записи галереи. */
export function toLayoutEntries(layouts: Layout[]): TemplateEntry[] {
  return layouts.map((l) => ({
    kind: 'layout',
    id: l.id,
    name: l.name,
    description: l.description ?? '',
    meta: 'Мой шаблон',
    thumbnail: l.thumbnail || undefined,
  }));
}

/**
 * Поиск по названию и описанию без учёта регистра и «ё».
 * @param entries - все шаблоны
 * @param query - строка поиска
 */
export function filterTemplates(entries: TemplateEntry[], query: string): TemplateEntry[] {
  return entries.filter((e) => matchesQuery([e.name, e.description], query));
}
