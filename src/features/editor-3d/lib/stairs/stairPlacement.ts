/**
 * Расстановка лестниц: лестница стоит внутри комнаты и не пересекает внутренние стены,
 * мебель, другие лестницы и вырез в полу над лестницей этажа ниже. Для мебели лестница
 * и такой вырез — препятствия на всю высоту этажа (на марш и в проём ничего не ставится).
 * @module editor-3d/lib/stairs/stairPlacement
 */

import { clampObbToRect, obbInsideRect, obbOverlap, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import { findFreeSpot, partitionFootprint, resolvePlacement, type PlacementObstacle, type PlacementOptions, type PlacementSubject } from '../placement';
import { interiorRect, nearestWall } from '../walls';
import type { Partition, RoomDimensions, Stair } from '../../types';
import { stairFootprint, stairLayout, type StairLayout } from './stairs';

/** Лестница как препятствие для мебели и других лестниц. */
export function stairObstacle(stair: Stair, layout: StairLayout, height: number): PlacementObstacle {
  return { id: stair.id, kind: 'partition', footprint: stairFootprint(stair, layout), yRange: [0, height], flat: false };
}

/** Вырез в полу (над лестницей этажа ниже) как препятствие. */
export function cutoutObstacle(rect: Rect, index: number, height: number): PlacementObstacle {
  return {
    id: `cutout-${index}`,
    kind: 'partition',
    footprint: { center: [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2], half: [(rect.maxX - rect.minX) / 2, (rect.maxZ - rect.minZ) / 2], angle: 0 },
    yRange: [0, height],
    flat: false,
  };
}

/**
 * Неподвижные препятствия этажа: его лестницы и вырезы в полу под лестницы снизу.
 * @param stairs - лестницы этажа
 * @param rise - высота подъёма лестниц этажа
 * @param cutouts - вырезы в полу (координаты этажа)
 * @param height - высота этажа
 * @param excludeId - лестница, которую сейчас двигают (не мешает сама себе)
 */
export function floorFixtures(stairs: readonly Stair[], rise: number, cutouts: readonly Rect[], height: number, excludeId?: string): PlacementObstacle[] {
  return [
    ...stairs.filter((s) => s.id !== excludeId).map((s) => stairObstacle(s, stairLayout(s.kind, rise, s.width), height)),
    ...cutouts.map((r, i) => cutoutObstacle(r, i, height)),
  ];
}

/**
 * Поворот новой лестницы: марш идёт вдоль ближайшей стены
 * (у левой и правой — вдоль оси Z, у передней и задней — вдоль оси X).
 */
export function autoStairAngle(center: Vec2, dims: RoomDimensions): number {
  const { side } = nearestWall(center, dims);
  return side === 'left' || side === 'right' ? 0 : -Math.PI / 2;
}

/** Результат размещения лестницы. */
export interface StairPlacement {
  stair: Stair;
  /** Лестница целиком в комнате и ни с чем не пересекается */
  valid: boolean;
}

const subjectOf = (stair: Stair, layout: StairLayout, height: number): PlacementSubject => ({
  footprint: stairFootprint(stair, layout),
  yRange: [0, height],
  flat: false,
});

/**
 * Поставить лестницу как можно ближе к желаемому месту.
 * @param stair - лестница в желаемом месте
 * @param layout - раскладка ступеней
 * @param room - размеры этажа
 * @param obstacles - стены, мебель, другие лестницы, вырезы
 * @param options - сетка и магнит к стенам
 */
export function resolveStair(stair: Stair, layout: StairLayout, room: RoomDimensions, obstacles: PlacementObstacle[], options: PlacementOptions): StairPlacement {
  const rect = { minX: -room.width / 2, maxX: room.width / 2, minZ: -room.depth / 2, maxZ: room.depth / 2 };
  const result = resolvePlacement(subjectOf(stair, layout, room.height), rect, obstacles, options);
  return { stair: { ...stair, position: [result.footprint.center[0], result.footprint.center[1]] }, valid: result.valid };
}

/**
 * Ближайшее свободное место для лестницы (null — на этаже ей нет места).
 * @param stair - лестница в желаемом месте
 * @param layout - раскладка ступеней
 * @param room - размеры этажа
 * @param obstacles - стены, мебель, другие лестницы, вырезы
 * @param options - сетка и магнит к стенам
 */
export function findStairSpot(stair: Stair, layout: StairLayout, room: RoomDimensions, obstacles: PlacementObstacle[], options: PlacementOptions): Stair | null {
  const rect = { minX: -room.width / 2, maxX: room.width / 2, minZ: -room.depth / 2, maxZ: room.depth / 2 };
  const footprint = findFreeSpot(subjectOf(stair, layout, room.height), rect, obstacles, options);
  return footprint ? { ...stair, position: [footprint.center[0], footprint.center[1]] } : null;
}

/** Помещается ли лестница на этаже: целиком в комнате и не пересекает внутренние стены. */
export function stairFits(stair: Stair, layout: StairLayout, room: RoomDimensions, partitions: readonly Partition[]): boolean {
  const footprint = stairFootprint(stair, layout);
  return obbInsideRect(footprint, interiorRect(room), 1e-4) && partitions.every((p) => !obbOverlap(footprint, partitionFootprint(p)).overlapping);
}

/** Вписать лестницу в комнату (после изменения размеров этажа). */
export function clampStair(stair: Stair, layout: StairLayout, room: RoomDimensions): Stair {
  const rect = { minX: -room.width / 2, maxX: room.width / 2, minZ: -room.depth / 2, maxZ: room.depth / 2 };
  const fitted = clampObbToRect(stairFootprint(stair, layout), rect);
  return { ...stair, position: [fitted.center[0], fitted.center[1]] };
}
