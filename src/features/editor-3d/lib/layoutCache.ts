/**
 * Кэш разбора планировки: стыки стен и помещения пересчитываются только при изменении
 * размеров комнаты или стен (состояние неизменяемо — достаточно сравнения ссылок).
 * @module editor-3d/lib/layoutCache
 */

import type { Obb } from '@/shared/lib/math/geometry2d';
import { detectRooms, type DetectedRoom } from './rooms';
import { walkObstacles, type WalkScene } from './walkObstacles';
import { analyzeWalls, type WallLayout } from './wallJoints';
import type { Partition, RoomDimensions } from '../types';

/** Мемоизация последнего вызова по ссылкам аргументов. */
function memoLast<R>(fn: (dims: RoomDimensions, partitions: Partition[]) => R) {
  let last: { dims: RoomDimensions; partitions: Partition[]; value: R } | null = null;
  return (dims: RoomDimensions, partitions: Partition[]): R => {
    if (last && last.dims === dims && last.partitions === partitions) return last.value;
    const value = fn(dims, partitions);
    last = { dims, partitions, value };
    return value;
  };
}

/** Стыки стен текущей планировки. */
export const cachedWallLayout: (dims: RoomDimensions, partitions: Partition[]) => WallLayout = memoLast(analyzeWalls);

/** Помещения текущей планировки. */
export const cachedRooms: (dims: RoomDimensions, partitions: Partition[]) => DetectedRoom[] = memoLast(detectRooms);

let lastWalk: { scene: WalkScene; value: Obb[] } | null = null;

/** Препятствия стен и дверей для хождения (пересчёт только при изменении стен и проёмов). */
export function cachedWalkObstacles(scene: WalkScene): Obb[] {
  const prev = lastWalk?.scene;
  const same =
    prev &&
    prev.dimensions === scene.dimensions &&
    prev.outerWalls === scene.outerWalls &&
    prev.removedWalls === scene.removedWalls &&
    prev.openings === scene.openings &&
    prev.partitions === scene.partitions;
  if (same && lastWalk) return lastWalk.value;
  const value = walkObstacles(scene, cachedWallLayout(scene.dimensions, scene.partitions));
  lastWalk = { scene, value };
  return value;
}
