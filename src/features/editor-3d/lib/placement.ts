/**
 * Расстановка мебели: футпринты (OBB на полу), ограничение комнатой,
 * выталкивание из перегородок и другой мебели, магнит к стенам, сетка,
 * автоповорот «спиной к стене» и поиск ближайшего свободного места.
 *
 * Модель предмета нормализована: позиция — центр низа, y = высота низа над полом
 * (0 — стоит на полу), поэтому предмет никогда не проваливается в пол.
 * @module editor-3d/lib/placement
 */

import {
  add2,
  clampObbToRect,
  obbBounds,
  obbInsideRect,
  obbOverlap,
  scale2,
  snapTo,
  type Obb,
  type Rect,
  type Vec2,
} from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import { itemTilt, tiltedExtent } from './tilt';
import { nearestWall, wallFrame } from './walls';
import type { Partition, RoomDimensions, WallSide } from '../types';

/** Габариты по умолчанию, пока модель ещё не измерена. */
export const DEFAULT_ITEM_SIZE = { halfWidth: 0.4, halfDepth: 0.4, height: 0.8 } as const;

/** Предметы ниже этой высоты считаются напольным покрытием (ковры) и не сталкиваются с мебелью. */
export const FLAT_ITEM_HEIGHT = 0.06;

/** Препятствие для размещения. */
export interface PlacementObstacle {
  id: string;
  kind: 'partition' | 'furniture';
  footprint: Obb;
  /** Вертикальный диапазон [низ, верх], м */
  yRange: readonly [number, number];
  /** Напольное покрытие (ковёр) */
  flat: boolean;
}

/** Параметры привязок. */
export interface PlacementOptions {
  /** Шаг сетки, м (null — без сетки) */
  gridStep: number | null;
  /** Радиус магнита к стенам, м (0 — выключен) */
  wallMagnet: number;
  /** Игнорировать столкновения с другой мебелью */
  ignoreFurniture?: boolean;
}

/** Размещаемый предмет. */
export interface PlacementSubject {
  footprint: Obb;
  yRange: readonly [number, number];
  flat: boolean;
}

/** Результат размещения. */
export interface PlacementResult {
  footprint: Obb;
  /** Предмет внутри комнаты и ни с чем не пересекается */
  valid: boolean;
  /** К какой стене примагничен предмет */
  snappedWall: WallSide | null;
}

const PUSH_ITERATIONS = 8;
const PUSH_EPSILON = 1e-4;

/** Масштабированные габариты модели предмета (без наклона). */
export function uprightSizes(item: FurnitureItem): { halfWidth: number; halfDepth: number; height: number } {
  const s = item.scale > 0 ? item.scale : 1;
  return {
    halfWidth: (item.halfWidth ?? DEFAULT_ITEM_SIZE.halfWidth) * s,
    halfDepth: (item.halfDepth ?? DEFAULT_ITEM_SIZE.halfDepth) * s,
    height: (item.height ?? DEFAULT_ITEM_SIZE.height) * s,
  };
}

/** Масштабированные габариты места, которое занимает предмет (у наклонённой подушки — с наклоном). */
export function itemSizes(item: FurnitureItem): { halfWidth: number; halfDepth: number; height: number } {
  const upright = uprightSizes(item);
  const tilt = itemTilt(item.rotation);
  return tilt === 0 ? upright : { halfWidth: upright.halfWidth, ...tiltedExtent(upright, tilt) };
}

/** Напольное покрытие (ковёр и т.п.). */
export function isFlatItem(item: FurnitureItem): boolean {
  return itemSizes(item).height < FLAT_ITEM_HEIGHT;
}

/** Футпринт предмета мебели на полу. */
export function furnitureFootprint(item: FurnitureItem): Obb {
  const { halfWidth, halfDepth } = itemSizes(item);
  return { center: [item.position[0], item.position[2]], half: [halfWidth, halfDepth], angle: item.rotation[1] };
}

/** Размещаемый предмет из элемента мебели. */
export function furnitureSubject(item: FurnitureItem): PlacementSubject {
  const bottom = Math.max(0, item.position[1]);
  return { footprint: furnitureFootprint(item), yRange: [bottom, bottom + itemSizes(item).height], flat: isFlatItem(item) };
}

/** Футпринт перегородки на полу. */
export function partitionFootprint(partition: Partition): Obb {
  return {
    center: [partition.position[0], partition.position[2]],
    half: [partition.size[0] / 2, partition.size[2] / 2],
    angle: partition.rotation[1],
  };
}

/**
 * Собрать препятствия сцены.
 * @param partitions - перегородки
 * @param furniture - мебель
 * @param excludeId - id перемещаемого предмета (не мешает сам себе)
 */
export function buildObstacles(partitions: Partition[], furniture: FurnitureItem[], excludeId?: string): PlacementObstacle[] {
  const walls: PlacementObstacle[] = partitions.map((p) => ({
    id: p.id,
    kind: 'partition',
    footprint: partitionFootprint(p),
    yRange: [0, p.size[1]],
    flat: false,
  }));
  const items: PlacementObstacle[] = furniture
    .filter((f) => f.id !== excludeId)
    .map((f) => ({ id: f.id, kind: 'furniture', ...furnitureSubject(f) }));
  return [...walls, ...items];
}

const rangesOverlap = (a: readonly [number, number], b: readonly [number, number]) =>
  a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6;

/** Мешает ли препятствие предмету (учитывает ковры, высоту и настройки). */
function blocks(subject: PlacementSubject, obstacle: PlacementObstacle, options: PlacementOptions): boolean {
  if (!rangesOverlap(subject.yRange, obstacle.yRange)) return false;
  if (obstacle.kind === 'partition') return true;
  return !options.ignoreFurniture && !subject.flat && !obstacle.flat;
}

/**
 * Примагнитить предмет к стенам: если зазор до стены меньше magnet — прижать вплотную.
 */
export function snapToWalls(footprint: Obb, rect: Rect, magnet: number): { footprint: Obb; side: WallSide | null } {
  if (magnet <= 0) return { footprint, side: null };
  const b = obbBounds(footprint);
  const gaps: Array<{ side: WallSide; gap: number; shift: Vec2 }> = [
    { side: 'left', gap: b.minX - rect.minX, shift: [rect.minX - b.minX, 0] },
    { side: 'right', gap: rect.maxX - b.maxX, shift: [rect.maxX - b.maxX, 0] },
    { side: 'back', gap: b.minZ - rect.minZ, shift: [0, rect.minZ - b.minZ] },
    { side: 'front', gap: rect.maxZ - b.maxZ, shift: [0, rect.maxZ - b.maxZ] },
  ];
  const close = gaps.filter((g) => g.gap >= -1e-6 && g.gap < magnet);
  const pickAxis = (sides: WallSide[]) =>
    close.filter((g) => sides.includes(g.side)).sort((a, b2) => a.gap - b2.gap)[0];
  const x = pickAxis(['left', 'right']);
  const z = pickAxis(['back', 'front']);
  const shift = add2(x?.shift ?? [0, 0], z?.shift ?? [0, 0]);
  const nearest = [x, z].filter(Boolean).sort((a, b2) => a!.gap - b2!.gap)[0];
  return { footprint: { ...footprint, center: add2(footprint.center, shift) }, side: nearest?.side ?? null };
}

/** Вытолкнуть предмет из препятствий (несколько итераций SAT). */
function pushOut(subject: PlacementSubject, rect: Rect, obstacles: PlacementObstacle[], options: PlacementOptions): Obb {
  let footprint = subject.footprint;
  for (let i = 0; i < PUSH_ITERATIONS; i += 1) {
    let moved = false;
    for (const obstacle of obstacles) {
      if (!blocks(subject, obstacle, options)) continue;
      const hit = obbOverlap(footprint, obstacle.footprint);
      if (!hit.overlapping) continue;
      const push = scale2(hit.mtv, 1 + PUSH_EPSILON / Math.max(hit.depth, PUSH_EPSILON));
      footprint = { ...footprint, center: add2(footprint.center, push) };
      moved = true;
    }
    footprint = clampObbToRect(footprint, rect);
    if (!moved) break;
  }
  return footprint;
}

/** Свободно ли место для предмета. */
export function isPlacementFree(subject: PlacementSubject, rect: Rect, obstacles: PlacementObstacle[], options: PlacementOptions): boolean {
  return (
    obbInsideRect(subject.footprint, rect, 1e-4) &&
    obstacles.every((o) => !blocks(subject, o, options) || !obbOverlap(subject.footprint, o.footprint).overlapping)
  );
}

/**
 * Разместить предмет: сетка → границы комнаты → магнит к стенам → выталкивание из препятствий.
 * @param subject - желаемое положение предмета
 * @param rect - внутренний прямоугольник комнаты
 * @param obstacles - препятствия (см. {@link buildObstacles})
 * @param options - привязки
 */
export function resolvePlacement(
  subject: PlacementSubject,
  rect: Rect,
  obstacles: PlacementObstacle[],
  options: PlacementOptions,
): PlacementResult {
  const gridded: Obb = options.gridStep
    ? { ...subject.footprint, center: [snapTo(subject.footprint.center[0], options.gridStep), snapTo(subject.footprint.center[1], options.gridStep)] }
    : subject.footprint;
  const snapped = snapToWalls(clampObbToRect(gridded, rect), rect, options.wallMagnet);
  const footprint = pushOut({ ...subject, footprint: snapped.footprint }, rect, obstacles, options);
  const valid = isPlacementFree({ ...subject, footprint }, rect, obstacles, options);
  return { footprint, valid, snappedWall: snapped.side };
}

/**
 * Найти ближайшее к желаемому свободное место (поиск по расширяющимся кольцам).
 * @returns футпринт свободного места или null, если места в комнате нет
 */
export function findFreeSpot(
  subject: PlacementSubject,
  rect: Rect,
  obstacles: PlacementObstacle[],
  options: PlacementOptions,
): Obb | null {
  const direct = resolvePlacement(subject, rect, obstacles, options);
  if (direct.valid) return direct.footprint;

  const step = 0.2;
  const maxRadius = Math.hypot(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  for (let radius = step; radius <= maxRadius; radius += step) {
    const samples = Math.max(8, Math.round((2 * Math.PI * radius) / step));
    for (let k = 0; k < samples; k += 1) {
      const a = (k / samples) * Math.PI * 2;
      const center = add2(subject.footprint.center, [Math.cos(a) * radius, Math.sin(a) * radius]);
      const attempt = resolvePlacement({ ...subject, footprint: { ...subject.footprint, center } }, rect, obstacles, options);
      if (attempt.valid) return attempt.footprint;
    }
  }
  return null;
}

/** Угол, при котором фасад предмета (локальная +Z) смотрит от стены в комнату. */
export function facingRoomAngle(side: WallSide, dims: RoomDimensions): number {
  return wallFrame(side, dims).rotationY;
}

/**
 * Автоповорот при установке у стены: если центр предмета ближе threshold к стене,
 * предмет разворачивается фасадом в комнату.
 * @returns угол или null, если рядом нет стены
 */
export function autoOrientAngle(center: Vec2, halfDepth: number, dims: RoomDimensions, threshold = 0.6): number | null {
  const { side, distance } = nearestWall(center, dims);
  return distance - halfDepth < threshold ? facingRoomAngle(side, dims) : null;
}
