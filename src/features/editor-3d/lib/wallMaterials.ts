/**
 * Реестр конструкционных материалов стен (кирпич, газобетон, гипсокартон и др.).
 *
 * Материал — отдельный параметр стены, не путать с отделкой (краска, обои, штукатурка):
 * отделка покрывает лицевые грани, а материал виден в разрезе (верх стены в «кукольном
 * домике»), на плане (штриховка) и на всей стене, если выбрана отделка «Без отделки».
 *
 * Чтобы добавить материал, достаточно одной записи в {@link WALL_MATERIALS}: схема документа,
 * инспектор, 3D-вид и штриховка плана берут список отсюда.
 * @module editor-3d/lib/wallMaterials
 */

import {
  bondTexture,
  concreteTexture,
  drywallTexture,
  formworkTexture,
  timberTexture,
} from '@/features/textures/lib/structureTextures';
import type { TextureDef, TextureDraw } from '@/features/textures/types';

/** Вид штриховки материала на плане (по мотивам ГОСТ 2.306). */
export type PlanHatch = 'diagonal' | 'diagonalReverse' | 'cross' | 'dots' | 'speckle' | 'reinforced' | 'plain';

/** Описание конструкционного материала стены. */
export interface WallMaterialDef {
  readonly id: string;
  /** Название в интерфейсе */
  readonly label: string;
  /** Короткая подсказка: где применяется */
  readonly hint: string;
  /** Типичные толщины, м (первая подсказка — `default`) */
  readonly thickness: { readonly default: number; readonly presets: readonly number[] };
  /** Внешний вид в 3D: процедурная текстура, размер тайла (м), шероховатость */
  readonly look: { readonly draw: TextureDraw; readonly tileMeters: number; readonly roughness: number };
  /** Штриховка на плане: рисунок, заливка и цвет линий */
  readonly plan: { readonly hatch: PlanHatch; readonly fill: string; readonly ink: string };
  /** Характерный цвет (значки, превью шаблонов) */
  readonly swatch: string;
}

const defineWallMaterials = <const T extends readonly WallMaterialDef[]>(defs: T): T => defs;

/** Все материалы стен в порядке показа в инспекторе. */
export const WALL_MATERIALS = defineWallMaterials([
  {
    id: 'brick',
    label: 'Кирпич',
    hint: 'Керамический полнотелый: несущие и наружные стены',
    thickness: { default: 0.25, presets: [0.12, 0.25, 0.38, 0.51] },
    look: {
      draw: bondTexture({ columns: 3, rows: 10, joint: 0.14, mortar: '#b4aca0', hue: [8, 20], sat: [42, 58], light: [34, 46], noise: 18, seed: 7 }),
      tileMeters: 0.75,
      roughness: 0.92,
    },
    plan: { hatch: 'diagonal', fill: '#efd5c7', ink: '#9c4a32' },
    swatch: '#a4553b',
  },
  {
    id: 'silicate',
    label: 'Силикатный кирпич',
    hint: 'Белый кирпич: внутренние и наружные стены',
    thickness: { default: 0.25, presets: [0.12, 0.25, 0.38] },
    look: {
      draw: bondTexture({ columns: 3, rows: 10, joint: 0.14, mortar: '#a19d96', hue: [38, 48], sat: [6, 12], light: [80, 89], noise: 12, seed: 17 }),
      tileMeters: 0.75,
      roughness: 0.9,
    },
    plan: { hatch: 'diagonal', fill: '#f1eee8', ink: '#8a857c' },
    swatch: '#d9d4ca',
  },
  {
    id: 'aerated',
    label: 'Газобетон',
    hint: 'Лёгкие блоки 625×250 мм на клею: стены и перегородки',
    thickness: { default: 0.2, presets: [0.1, 0.15, 0.2, 0.3, 0.375] },
    look: {
      draw: bondTexture({ columns: 2, rows: 5, joint: 0.03, mortar: '#c9c6bf', hue: [40, 50], sat: [4, 8], light: [86, 91], noise: 10, pores: 420, seed: 23 }),
      tileMeters: 1.25,
      roughness: 0.97,
    },
    plan: { hatch: 'dots', fill: '#f4f2ec', ink: '#8f8a80' },
    swatch: '#e4e1da',
  },
  {
    id: 'foam',
    label: 'Пеноблок',
    hint: 'Пенобетонные блоки 600×300 мм на растворе',
    thickness: { default: 0.2, presets: [0.1, 0.2, 0.3] },
    look: {
      draw: bondTexture({ columns: 2, rows: 4, joint: 0.07, mortar: '#8f8c86', hue: [35, 45], sat: [3, 7], light: [64, 72], noise: 16, pores: 260, seed: 31 }),
      tileMeters: 1.2,
      roughness: 0.96,
    },
    plan: { hatch: 'cross', fill: '#e6e4de', ink: '#7c776f' },
    swatch: '#a9a6a0',
  },
  {
    id: 'concrete',
    label: 'Бетон',
    hint: 'Бетонные стеновые панели и блоки',
    thickness: { default: 0.2, presets: [0.12, 0.16, 0.2, 0.3] },
    look: {
      draw: concreteTexture({ base: '#a8a9a6', blotches: 18, pores: 160, noise: 20, seed: 41 }),
      tileMeters: 2,
      roughness: 0.95,
    },
    plan: { hatch: 'speckle', fill: '#dcddda', ink: '#6c6d6a' },
    swatch: '#a8a9a6',
  },
  {
    id: 'monolith',
    label: 'Монолитный ж/б',
    hint: 'Монолитный железобетон: несущие стены и пилоны',
    thickness: { default: 0.2, presets: [0.16, 0.2, 0.25, 0.3] },
    look: {
      draw: formworkTexture({ base: '#9b9d9b', blotches: 14, pores: 120, noise: 18, seed: 53 }, { columns: 2, rows: 4 }),
      tileMeters: 2.4,
      roughness: 0.9,
    },
    plan: { hatch: 'reinforced', fill: '#cfd1d0', ink: '#545756' },
    swatch: '#8e908e',
  },
  {
    id: 'drywall',
    label: 'Гипсокартон',
    hint: 'Каркасные перегородки: профиль и листы ГКЛ',
    thickness: { default: 0.1, presets: [0.075, 0.1, 0.125, 0.15] },
    look: { draw: drywallTexture(61), tileMeters: 1.2, roughness: 0.85 },
    plan: { hatch: 'plain', fill: '#f6f5f1', ink: '#a29d92' },
    swatch: '#dedcd6',
  },
  {
    id: 'timber',
    label: 'Деревянный брус',
    hint: 'Брус и бревно: дома и бани',
    thickness: { default: 0.15, presets: [0.1, 0.15, 0.2] },
    look: { draw: timberTexture(6, 71), tileMeters: 0.9, roughness: 0.8 },
    plan: { hatch: 'diagonalReverse', fill: '#ecd6b2', ink: '#8a5a2b' },
    swatch: '#9b6a3c',
  },
]);

/** Идентификатор материала стены. */
export type WallMaterialId = (typeof WALL_MATERIALS)[number]['id'];

/** Список идентификаторов (для схемы документа). */
export const WALL_MATERIAL_IDS = WALL_MATERIALS.map((m) => m.id) as [WallMaterialId, ...WallMaterialId[]];

/** Материал внешних стен по умолчанию. */
export const DEFAULT_OUTER_MATERIAL: WallMaterialId = 'brick';
/** Материал новых внутренних стен по умолчанию. */
export const DEFAULT_INTERIOR_MATERIAL: WallMaterialId = 'drywall';

/** Проверка, что строка — известный материал стены. */
export function isWallMaterialId(id: unknown): id is WallMaterialId {
  return typeof id === 'string' && WALL_MATERIALS.some((m) => m.id === id);
}

/**
 * Описание материала по id (неизвестный — материал по умолчанию).
 * @param id - идентификатор материала
 * @param fallback - материал, если id не задан или неизвестен
 */
export function wallMaterial(id: string | undefined, fallback: WallMaterialId = DEFAULT_INTERIOR_MATERIAL): WallMaterialDef {
  return WALL_MATERIALS.find((m) => m.id === id) ?? WALL_MATERIALS.find((m) => m.id === fallback) ?? WALL_MATERIALS[0];
}

/**
 * Подходящие толщины материала в пределах допустимого диапазона.
 * @param id - материал
 * @param limits - [мин, макс] толщины для этого вида стены
 */
export function thicknessPresets(id: WallMaterialId, limits: readonly [number, number]): number[] {
  return wallMaterial(id).thickness.presets.filter((t) => t >= limits[0] - 1e-9 && t <= limits[1] + 1e-9);
}

const textureDefs = new Map<string, TextureDef>();

/** Процедурная текстура материала для 3D (одна на материал, общий кэш). */
export function wallMaterialTexture(id: WallMaterialId): TextureDef {
  const cached = textureDefs.get(id);
  if (cached) return cached;
  const def = wallMaterial(id);
  const texture: TextureDef = {
    id: `structure-${def.id}`,
    label: def.label,
    category: 'wall',
    tileMeters: def.look.tileMeters,
    roughness: def.look.roughness,
    draw: def.look.draw,
    resolution: 512,
  };
  textureDefs.set(id, texture);
  return texture;
}
