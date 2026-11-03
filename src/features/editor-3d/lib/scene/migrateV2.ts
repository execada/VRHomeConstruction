/**
 * Миграция документа сцены v2 → v3.
 *
 * Отличия v2:
 * - одна толщина всех внешних стен (`wallThickness`) и без материала;
 * - у перегородок нет конструкционного материала.
 *
 * Миграция работает с «сырым» объектом (до проверки схемой): результат затем проходит
 * обычную проверку v3, а повреждённые элементы отбрасываются как обычно.
 * @module editor-3d/lib/scene/migrateV2
 */

import { clamp } from '@/shared/lib/math/geometry2d';
import { DEFAULT_WALL_THICKNESS, uniformOuterWalls } from '../../constants';
import type { WallMaterialId } from '../../types';
import { SCENE_LIMITS } from './schema';

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Толщина перегородки, начиная с которой старая перегородка считается газобетонной, м. */
const MASONRY_PARTITION_THICKNESS = 0.15;

/**
 * Материал перегородки старого проекта: тонкие (до 15 см) — гипсокартон, толще — газобетон.
 * @param thickness - толщина перегородки, м
 */
export function legacyPartitionMaterial(thickness: number): WallMaterialId {
  return thickness >= MASONRY_PARTITION_THICKNESS ? 'aerated' : 'drywall';
}

/** Перегородка v2 с материалом (если его ещё нет). */
function upgradePartition(raw: unknown): unknown {
  if (!isObject(raw) || raw.material !== undefined) return raw;
  const size = Array.isArray(raw.size) ? raw.size : [];
  const thickness = typeof size[2] === 'number' ? size[2] : 0;
  return { ...raw, material: legacyPartitionMaterial(thickness) };
}

/**
 * Перевести «сырой» документ v2 в v3.
 * @param raw - roomData со schemaVersion = 2
 * @returns объект в формате v3 (ещё не проверенный схемой)
 */
export function migrateV2(raw: Loose): Loose {
  const { wallThickness, ...rest } = raw;
  const thickness =
    typeof wallThickness === 'number' && Number.isFinite(wallThickness)
      ? clamp(wallThickness, SCENE_LIMITS.wallThickness[0], SCENE_LIMITS.wallThickness[1])
      : DEFAULT_WALL_THICKNESS;
  return {
    ...rest,
    schemaVersion: 3,
    outerWalls: uniformOuterWalls(thickness),
    partitions: Array.isArray(raw.partitions) ? raw.partitions.map(upgradePartition) : raw.partitions,
  };
}
