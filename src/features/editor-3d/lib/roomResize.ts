/**
 * Изменение размеров комнаты с сохранением расстановки.
 *
 * Комната всегда центрирована в своих координатах, поэтому при перетаскивании одной стены
 * всё содержимое сдвигается так, чтобы противоположная стена осталась на месте (сам этаж
 * при этом смещается в здании на обратный сдвиг — см. команды комнаты).
 * После сдвига проёмы, перегородки, лестницы и мебель приводятся к новым границам; концы
 * внутренних стен, примыкавшие к внешним стенам, остаются примкнутыми (стена удлиняется
 * или укорачивается).
 * @module editor-3d/lib/roomResize
 */

import { add2, clamp, dot2, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import { normalizeWallOpenings } from './openings';
import { clampPartition, partitionEndpoints, partitionFromEndpoints } from './partitions';
import { JOINT_TOLERANCE } from './wallJoints';
import { DEFAULT_SLAB_THICKNESS, floorRise } from './building/floors';
import { intersectRects, translateRect } from './building/rects';
import { buildObstacles, findFreeSpot, furnitureSubject, resolvePlacement, type PlacementObstacle } from './placement';
import { clampStair, floorFixtures } from './stairs/stairPlacement';
import { stairLayout } from './stairs/stairs';
import { interiorRect, isWallSide, wallFrame, WALL_SIDES } from './walls';
import type { Opening, Partition, RoomDimensions, RoomLabel, Stair, WallSide } from '../types';

/** Содержимое комнаты, затрагиваемое изменением размеров. */
export interface RoomContent {
  dimensions: RoomDimensions;
  openings: { [wallId: string]: Opening[] };
  partitions: Partition[];
  furniture: FurnitureItem[];
  /** Подписи помещений (сдвигаются вместе с содержимым) */
  rooms?: RoomLabel[];
  /** Лестницы (сдвигаются вместе с содержимым и остаются в комнате) */
  stairs?: Stair[];
  /** Вырезы в полу над лестницами этажа ниже: в здании они на месте, мебель в них не встаёт */
  cutouts?: Rect[];
}

/** Какие стены остаются на месте (по каждой оси). */
export interface ResizeAnchor {
  x?: 'left' | 'right';
  z?: 'back' | 'front';
}

/** Сдвиг содержимого, при котором закреплённые стены остаются на месте. */
export function resizeShift(prev: RoomDimensions, next: RoomDimensions, anchor: ResizeAnchor): Vec2 {
  const dx = (next.width - prev.width) / 2;
  const dz = (next.depth - prev.depth) / 2;
  const sx = anchor.x === 'left' ? -dx : anchor.x === 'right' ? dx : 0;
  const sz = anchor.z === 'back' ? -dz : anchor.z === 'front' ? dz : 0;
  return [sx, sz];
}

/** Якорь для перетаскивания стены `side`: закрепляется противоположная. */
export function anchorForDraggedWall(side: WallSide): ResizeAnchor {
  switch (side) {
    case 'right': return { x: 'left' };
    case 'left': return { x: 'right' };
    case 'front': return { z: 'back' };
    default: return { z: 'front' };
  }
}

/** Сдвинуть проёмы внешних стен и привести их к новым стенам. */
function resizeOpenings(openings: RoomContent['openings'], next: RoomDimensions, shift: Vec2) {
  return WALL_SIDES.reduce<RoomContent['openings']>((acc, side) => {
    const list = openings[side];
    if (!list?.length) return acc;
    const frame = wallFrame(side, next);
    const du = dot2(shift, frame.tangent);
    const moved = list.map((o) => ({ ...o, position: [o.position[0] + du, o.position[1]] as [number, number] }));
    const fitted = normalizeWallOpenings(moved, { length: frame.length, height: frame.height });
    return fitted.length ? { ...acc, [side]: fitted } : acc;
  }, Object.fromEntries(Object.entries(openings).filter(([id]) => !isWallSide(id))));
}

/** Конец стены после сдвига: примкнутый к внешней стене конец остаётся на её грани. */
function followBoundary(point: Vec2, shift: Vec2, before: Rect, after: Rect): Vec2 {
  const near = (a: number, b: number) => Math.abs(a - b) <= JOINT_TOLERANCE;
  const [x, z] = add2(point, shift);
  const nx = near(point[0], before.minX) ? after.minX : near(point[0], before.maxX) ? after.maxX : x;
  const nz = near(point[1], before.minZ) ? after.minZ : near(point[1], before.maxZ) ? after.maxZ : z;
  return [clamp(nx, after.minX, after.maxX), clamp(nz, after.minZ, after.maxZ)];
}

/** Сдвинуть перегородки; перегородки «во всю высоту» следуют за новой высотой. */
function resizePartitions(partitions: Partition[], prev: RoomDimensions, next: RoomDimensions, shift: Vec2): Partition[] {
  const before = interiorRect(prev);
  const after = interiorRect(next);
  return partitions.map((p) => {
    const fullHeight = Math.abs(p.size[1] - prev.height) < 1e-3;
    const sized: Partition = { ...p, size: [p.size[0], fullHeight ? next.height : p.size[1], p.size[2]] };
    const [a, b] = partitionEndpoints(p).map((end) => followBoundary(end, shift, before, after));
    const rebuilt = partitionFromEndpoints(sized, a, b, next);
    if (rebuilt !== sized) return rebuilt;
    const center = add2([p.position[0], p.position[2]], shift);
    return clampPartition({ ...sized, position: [center[0], p.position[1], center[1]] }, next);
  });
}

/** Сдвинуть подписи помещений вместе с содержимым. */
function resizeLabels(labels: RoomLabel[], next: RoomDimensions, shift: Vec2): RoomLabel[] {
  const r = interiorRect(next);
  return labels.map((l) => ({ ...l, anchor: [clamp(l.anchor[0] + shift[0], r.minX, r.maxX), clamp(l.anchor[1] + shift[1], r.minZ, r.maxZ)] }));
}

/** Сдвинуть лестницы и вписать их в новые границы (ступени — по новой высоте этажа). */
function resizeStairs(stairs: Stair[], next: RoomDimensions, shift: Vec2, rise: number): Stair[] {
  return stairs.map((s) => clampStair({ ...s, position: [s.position[0] + shift[0], s.position[1] + shift[1]] }, stairLayout(s.kind, rise, s.width), next));
}

/** Сдвинуть мебель и заново разрешить столкновения в новых границах. */
function resizeFurniture(items: FurnitureItem[], partitions: Partition[], fixtures: PlacementObstacle[], next: RoomDimensions, shift: Vec2): FurnitureItem[] {
  const rect = interiorRect(next);
  const options = { gridStep: null, wallMagnet: 0 };
  return items.reduce<FurnitureItem[]>((placed, item) => {
    const moved: FurnitureItem = {
      ...item,
      position: [item.position[0] + shift[0], item.position[1], item.position[2] + shift[1]],
    };
    const subject = furnitureSubject(moved);
    const obstacles = [...buildObstacles(partitions, placed), ...fixtures];
    const direct = resolvePlacement(subject, rect, obstacles, options);
    const footprint = direct.valid ? direct.footprint : findFreeSpot(subject, rect, obstacles, options) ?? direct.footprint;
    return [...placed, { ...moved, position: [footprint.center[0], moved.position[1], footprint.center[1]] }];
  }, []);
}

/**
 * Изменить размеры комнаты.
 * @param content - текущее содержимое комнаты
 * @param next - новые размеры
 * @param anchor - какие стены остаются на месте (по умолчанию комната растёт от центра)
 * @param slab - толщина перекрытия (высота подъёма лестниц = высота этажа + перекрытие)
 */
export function resizeRoom(content: RoomContent, next: RoomDimensions, anchor: ResizeAnchor = {}, slab = DEFAULT_SLAB_THICKNESS): RoomContent {
  const shift = resizeShift(content.dimensions, next, anchor);
  const partitions = resizePartitions(content.partitions, content.dimensions, next, shift);
  const rise = floorRise(next, slab);
  const stairs = resizeStairs(content.stairs ?? [], next, shift, rise);
  const interior = interiorRect(next);
  const cutouts = (content.cutouts ?? []).map((r) => intersectRects(translateRect(r, shift), interior)).filter((r): r is Rect => r !== null);
  return {
    dimensions: next,
    openings: resizeOpenings(content.openings, next, shift),
    partitions,
    stairs,
    furniture: resizeFurniture(content.furniture, partitions, floorFixtures(stairs, rise, cutouts, next.height), next, shift),
    rooms: resizeLabels(content.rooms ?? [], next, shift),
  };
}
