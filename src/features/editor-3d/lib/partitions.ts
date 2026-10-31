/**
 * Перегородки (внутренние стены): создание, ограничения размеров, перемещение,
 * поворот, редактирование концов на плане, скругление углов.
 * Перегородка считается полноценной стеной: на ней можно делать проёмы.
 * @module editor-3d/lib/partitions
 */

import { clamp, clampObbToRect, length2, normalizeAngle, sub2, type Vec2, add2, scale2, rotateLocal } from '@/shared/lib/math/geometry2d';
import { normalizeWallOpenings } from './openings';
import { interiorRect } from './walls';
import type { Partition, RoomDimensions, SurfaceFinish } from '../types';

/** Ограничения размеров перегородки, м. */
export const PARTITION_LIMITS = {
  minLength: 0.3,
  minHeight: 0.3,
  minThickness: 0.05,
  maxThickness: 0.5,
} as const;

/** Параметры новой перегородки. */
export const PARTITION_DEFAULTS = { length: 2, thickness: 0.1, cornerRadius: 0 } as const;

/** Максимальный радиус скругления для толщины и высоты перегородки. */
export function maxCornerRadius(partition: Pick<Partition, 'size'>): number {
  return Math.max(0, Math.min(partition.size[2] / 2, partition.size[1] / 4));
}

/** Центр перегородки на полу. */
const centerOf = (p: Partition): Vec2 => [p.position[0], p.position[2]];

/**
 * Привести перегородку к допустимому виду: размеры, высота центра, только поворот по Y,
 * радиус скругления, положение внутри комнаты и проёмы.
 */
export function clampPartition(partition: Partition, dims: RoomDimensions): Partition {
  const maxLength = Math.max(dims.width, dims.depth);
  const length = clamp(partition.size[0], PARTITION_LIMITS.minLength, maxLength);
  const height = clamp(partition.size[1], PARTITION_LIMITS.minHeight, dims.height);
  const thickness = clamp(partition.size[2], PARTITION_LIMITS.minThickness, PARTITION_LIMITS.maxThickness);
  const angle = normalizeAngle(partition.rotation[1]);
  const fitted = clampObbToRect(
    { center: centerOf(partition), half: [length / 2, thickness / 2], angle },
    interiorRect(dims),
  );
  const size: [number, number, number] = [length, height, thickness];
  return {
    ...partition,
    position: [fitted.center[0], height / 2, fitted.center[1]],
    rotation: [0, angle, 0],
    size,
    cornerRadius: clamp(partition.cornerRadius ?? 0, 0, maxCornerRadius({ size })),
    openings: normalizeWallOpenings(partition.openings, { length, height }),
  };
}

/**
 * Создать перегородку на всю высоту комнаты.
 * @param params - id, центр на полу [x, z], поворот, размеры комнаты, отделка, длина
 */
export function createPartition(params: {
  id: string;
  center: Vec2;
  angle?: number;
  dims: RoomDimensions;
  finish?: SurfaceFinish;
  length?: number;
}): Partition {
  const { id, center, angle = 0, dims, finish, length = PARTITION_DEFAULTS.length } = params;
  return clampPartition(
    {
      id,
      position: [center[0], dims.height / 2, center[1]],
      rotation: [0, angle, 0],
      size: [Math.min(length, Math.max(dims.width, dims.depth) * 0.6), dims.height, PARTITION_DEFAULTS.thickness],
      openings: [],
      finish,
      cornerRadius: PARTITION_DEFAULTS.cornerRadius,
    },
    dims,
  );
}

/** Концы перегородки на полу [начало, конец] (вдоль локальной +X). */
export function partitionEndpoints(partition: Partition): [Vec2, Vec2] {
  const dir = rotateLocal([1, 0], partition.rotation[1]);
  const half = scale2(dir, partition.size[0] / 2);
  const c = centerOf(partition);
  return [sub2(c, half), add2(c, half)];
}

/**
 * Перестроить перегородку по двум концам (перетаскивание концов на плане).
 * Поворот вычисляется так, чтобы локальная +X шла от `start` к `end`.
 */
export function partitionFromEndpoints(partition: Partition, start: Vec2, end: Vec2, dims: RoomDimensions): Partition {
  const d = sub2(end, start);
  const length = length2(d);
  if (length < 1e-6) return partition;
  const angle = Math.atan2(-d[1], d[0]);
  const mid = scale2(add2(start, end), 0.5);
  return clampPartition(
    { ...partition, position: [mid[0], partition.position[1], mid[1]], rotation: [0, angle, 0], size: [length, partition.size[1], partition.size[2]] },
    dims,
  );
}

/** Переместить перегородку (центр на полу). */
export function movePartition(partition: Partition, center: Vec2, dims: RoomDimensions): Partition {
  return clampPartition({ ...partition, position: [center[0], partition.position[1], center[1]] }, dims);
}

/** Повернуть перегородку на абсолютный угол. */
export function rotatePartition(partition: Partition, angle: number, dims: RoomDimensions): Partition {
  return clampPartition({ ...partition, rotation: [0, angle, 0] }, dims);
}

/** Изменить габариты перегородки (длина, высота, толщина) с пересчётом проёмов. */
export function resizePartition(
  partition: Partition,
  size: { length?: number; height?: number; thickness?: number },
  dims: RoomDimensions,
): Partition {
  return clampPartition(
    {
      ...partition,
      size: [size.length ?? partition.size[0], size.height ?? partition.size[1], size.thickness ?? partition.size[2]],
    },
    dims,
  );
}
