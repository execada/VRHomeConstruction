/**
 * Изменение размеров комнаты с сохранением расстановки.
 *
 * Комната всегда центрирована в начале координат, поэтому при перетаскивании одной стены
 * всё содержимое сдвигается так, чтобы противоположная стена осталась на месте.
 * После сдвига проёмы, перегородки и мебель приводятся к новым границам.
 * @module editor-3d/lib/roomResize
 */

import { add2, dot2, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import { normalizeWallOpenings } from './openings';
import { clampPartition } from './partitions';
import { buildObstacles, findFreeSpot, furnitureSubject, resolvePlacement } from './placement';
import { interiorRect, isWallSide, wallFrame, WALL_SIDES } from './walls';
import type { Opening, Partition, RoomDimensions, WallSide } from '../types';

/** Содержимое комнаты, затрагиваемое изменением размеров. */
export interface RoomContent {
  dimensions: RoomDimensions;
  openings: { [wallId: string]: Opening[] };
  partitions: Partition[];
  furniture: FurnitureItem[];
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

/** Сдвинуть перегородки; перегородки «во всю высоту» следуют за новой высотой. */
function resizePartitions(partitions: Partition[], prev: RoomDimensions, next: RoomDimensions, shift: Vec2): Partition[] {
  return partitions.map((p) => {
    const fullHeight = Math.abs(p.size[1] - prev.height) < 1e-3;
    const center = add2([p.position[0], p.position[2]], shift);
    return clampPartition(
      {
        ...p,
        position: [center[0], p.position[1], center[1]],
        size: [p.size[0], fullHeight ? next.height : p.size[1], p.size[2]],
      },
      next,
    );
  });
}

/** Сдвинуть мебель и заново разрешить столкновения в новых границах. */
function resizeFurniture(items: FurnitureItem[], partitions: Partition[], next: RoomDimensions, shift: Vec2): FurnitureItem[] {
  const rect = interiorRect(next);
  const options = { gridStep: null, wallMagnet: 0 };
  return items.reduce<FurnitureItem[]>((placed, item) => {
    const moved: FurnitureItem = {
      ...item,
      position: [item.position[0] + shift[0], item.position[1], item.position[2] + shift[1]],
    };
    const subject = furnitureSubject(moved);
    const obstacles = buildObstacles(partitions, placed);
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
 */
export function resizeRoom(content: RoomContent, next: RoomDimensions, anchor: ResizeAnchor = {}): RoomContent {
  const shift = resizeShift(content.dimensions, next, anchor);
  const partitions = resizePartitions(content.partitions, content.dimensions, next, shift);
  return {
    dimensions: next,
    openings: resizeOpenings(content.openings, next, shift),
    partitions,
    furniture: resizeFurniture(content.furniture, partitions, next, shift),
  };
}
