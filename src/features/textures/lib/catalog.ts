/**
 * Каталог текстур: PBR-текстуры из манифеста ассетов + встроенные процедурные.
 * @module textures/lib/catalog
 */

import type { TextureEntry } from '@/features/assets/lib/manifest';
import { PROCEDURAL_TEXTURES } from './procedural';
import type { TextureCategory, TextureDef } from '../types';

/** Шероховатость по умолчанию для PBR без карты шероховатости. */
const DEFAULT_ROUGHNESS: Record<TextureCategory, number> = { floor: 0.6, wall: 0.9, ceiling: 0.95 };

/** Описание текстуры из записи манифеста. */
export function textureFromEntry(entry: TextureEntry): TextureDef {
  return {
    id: entry.id,
    label: entry.label,
    category: entry.category,
    tileMeters: entry.tileMeters,
    roughness: DEFAULT_ROUGHNESS[entry.category],
    maps: { color: entry.maps.color, normal: entry.maps.normal, roughness: entry.maps.roughness },
    thumbnail: entry.thumbnail,
    credit: { source: entry.source, license: entry.license, author: entry.author },
  };
}

/**
 * Полный каталог: сначала качественные PBR-текстуры, затем базовые процедурные.
 * @param entries - текстуры из манифеста
 */
export function buildTextureCatalog(entries: TextureEntry[]): TextureDef[] {
  return [...entries.map(textureFromEntry), ...PROCEDURAL_TEXTURES];
}

/** Текстуры для поверхности. */
export function texturesFor(catalog: TextureDef[], category: TextureCategory): TextureDef[] {
  return catalog.filter((t) => t.category === category);
}

/** Запасные процедурные текстуры, если PBR-текстура недоступна. */
const FALLBACK: Partial<Record<TextureCategory, string>> = { floor: 'floor-wood' };

/**
 * Найти текстуру по id. Если её нет в каталоге (каталог не загрузился или текстура удалена),
 * для пола возвращается базовая процедурная, для остальных — null (однотонная поверхность).
 */
export function resolveTexture(catalog: TextureDef[], id: string | null, category: TextureCategory): TextureDef | null {
  if (!id) return null;
  const found = catalog.find((t) => t.id === id);
  if (found) return found;
  const fallback = FALLBACK[category];
  return fallback ? catalog.find((t) => t.id === fallback) ?? null : null;
}
