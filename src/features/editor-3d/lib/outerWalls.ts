/**
 * Конструкция внешних стен: изменение толщины и материала одной стены или всех сразу
 * с проверкой допустимых значений.
 * @module editor-3d/lib/outerWalls
 */

import { clamp } from '@/shared/lib/math/geometry2d';
import { WALL_THICKNESS_LIMITS } from '../constants';
import { isWallMaterialId } from './wallMaterials';
import { WALL_SIDES } from './walls';
import type { OuterWalls, OuterWallSpec, WallSide } from '../types';

/** Какие стены меняются: одна сторона или все четыре. */
export type OuterWallTarget = WallSide | 'all';

/**
 * Применить изменение к конструкции стены: толщина ограничивается диапазоном,
 * неизвестный материал игнорируется.
 */
export function applyOuterWallPatch(spec: OuterWallSpec, patch: Partial<OuterWallSpec>): OuterWallSpec {
  const thickness = patch.thickness !== undefined && Number.isFinite(patch.thickness) ? patch.thickness : spec.thickness;
  return {
    thickness: clamp(thickness, WALL_THICKNESS_LIMITS[0], WALL_THICKNESS_LIMITS[1]),
    material: isWallMaterialId(patch.material) ? patch.material : spec.material,
  };
}

/**
 * Новая конструкция внешних стен.
 * @param walls - текущая конструкция
 * @param target - сторона или 'all'
 * @param patch - новая толщина и/или материал
 */
export function updateOuterWalls(walls: OuterWalls, target: OuterWallTarget, patch: Partial<OuterWallSpec>): OuterWalls {
  const sides = target === 'all' ? WALL_SIDES : [target];
  return sides.reduce<OuterWalls>((acc, side) => ({ ...acc, [side]: applyOuterWallPatch(acc[side], patch) }), walls);
}

/** Одинаковы ли толщины всех внешних стен (для общего поля «Толщина стен»). */
export function uniformThickness(walls: OuterWalls): number | null {
  const first = walls.front.thickness;
  return WALL_SIDES.every((side) => Math.abs(walls[side].thickness - first) < 1e-6) ? first : null;
}
