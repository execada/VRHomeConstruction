/**
 * Перегородки (внутренние стены): создание, ограничения размеров, перемещение,
 * поворот, редактирование концов на плане, скругление углов.
 * Перегородка считается полноценной стеной: на ней можно делать проёмы.
 * @module editor-3d/lib/partitions
 */

import { clamp, length2, normalizeAngle, sub2, type Rect, type Vec2, add2, scale2, rotateLocal } from '@/shared/lib/math/geometry2d';
import { normalizeWallOpenings } from './openings';
import { DEFAULT_INTERIOR_MATERIAL, isWallMaterialId } from './wallMaterials';
import { interiorRect } from './walls';
import type { Partition, RoomDimensions, SurfaceFinish, WallMaterialId } from '../types';

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

/** Стена с меньшим синусом угла к внешней стене считается ей параллельной. */
const PARALLEL_SIN = Math.sin((10 * Math.PI) / 180);

/**
 * Вписать ось стены в комнату: концы — внутри (на внутренних гранях внешних стен можно,
 * это Т-стык), параллельная внешней стене стена не заходит в неё своей толщиной.
 * Слишком длинная стена укорачивается с сохранением направления.
 */
function fitAxis(center: Vec2, length: number, angle: number, half: number, rect: Rect): { center: Vec2; length: number } {
  const dir = rotateLocal([1, 0], angle);
  const insetX = Math.abs(dir[0]) < PARALLEL_SIN ? half : 0;
  const insetZ = Math.abs(dir[1]) < PARALLEL_SIN ? half : 0;
  const r = { minX: rect.minX + insetX, maxX: rect.maxX - insetX, minZ: rect.minZ + insetZ, maxZ: rect.maxZ - insetZ };
  const ex = (Math.abs(dir[0]) * length) / 2;
  const ez = (Math.abs(dir[1]) * length) / 2;
  const k = Math.min(1, ex > 1e-9 ? (r.maxX - r.minX) / (2 * ex) : 1, ez > 1e-9 ? (r.maxZ - r.minZ) / (2 * ez) : 1);
  const fit = (v: number, min: number, max: number, e: number) => (max - min < 2 * e ? (min + max) / 2 : clamp(v, min + e, max - e));
  return { center: [fit(center[0], r.minX, r.maxX, ex * k), fit(center[1], r.minZ, r.maxZ, ez * k)], length: length * k };
}

/**
 * Привести перегородку к допустимому виду: размеры, высота центра, только поворот по Y,
 * радиус скругления, положение внутри комнаты и проёмы.
 */
export function clampPartition(partition: Partition, dims: RoomDimensions): Partition {
  const maxLength = Math.hypot(dims.width, dims.depth);
  const height = clamp(partition.size[1], PARTITION_LIMITS.minHeight, dims.height);
  const thickness = clamp(partition.size[2], PARTITION_LIMITS.minThickness, PARTITION_LIMITS.maxThickness);
  const angle = normalizeAngle(partition.rotation[1]);
  const fitted = fitAxis(centerOf(partition), clamp(partition.size[0], PARTITION_LIMITS.minLength, maxLength), angle, thickness / 2, interiorRect(dims));
  const length = fitted.length;
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
 * @param params - id, центр на полу [x, z], поворот, размеры комнаты, отделка, длина, материал, толщина
 */
export function createPartition(params: {
  id: string;
  center: Vec2;
  angle?: number;
  dims: RoomDimensions;
  finish?: SurfaceFinish;
  length?: number;
  material?: WallMaterialId;
  thickness?: number;
}): Partition {
  const { id, center, angle = 0, dims, finish, length = PARTITION_DEFAULTS.length } = params;
  return clampPartition(
    {
      id,
      position: [center[0], dims.height / 2, center[1]],
      rotation: [0, angle, 0],
      size: [Math.min(length, Math.max(dims.width, dims.depth) * 0.6), dims.height, params.thickness ?? PARTITION_DEFAULTS.thickness],
      openings: [],
      finish,
      cornerRadius: PARTITION_DEFAULTS.cornerRadius,
      material: params.material ?? DEFAULT_INTERIOR_MATERIAL,
    },
    dims,
  );
}

/** Материал внутренней стены (старые стены без материала — гипсокартон). */
export function partitionMaterial(partition: Pick<Partition, 'material'>): WallMaterialId {
  return isWallMaterialId(partition.material) ? partition.material : DEFAULT_INTERIOR_MATERIAL;
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
