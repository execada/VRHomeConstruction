/**
 * Кэш разбора планировки: стыки стен и помещения пересчитываются только при изменении
 * размеров этажа или стен (состояние неизменяемо — достаточно сравнения ссылок).
 * Кэш хранит результат для каждого этажа (ключи — ссылки на стены и размеры), поэтому
 * этажи не вытесняют друг друга; старые записи освобождаются вместе со своими данными.
 * @module editor-3d/lib/layoutCache
 */

import { detectRooms, type DetectedRoom } from './rooms';
import { analyzeWalls, type WallLayout } from './wallJoints';
import type { Partition, RoomDimensions } from '../types';

/** Мемоизация по ссылкам на стены и размеры (WeakMap: без утечек). */
function memoByRefs<R>(fn: (dims: RoomDimensions, partitions: Partition[]) => R) {
  const cache = new WeakMap<Partition[], WeakMap<RoomDimensions, R>>();
  return (dims: RoomDimensions, partitions: Partition[]): R => {
    const byDims = cache.get(partitions) ?? new WeakMap<RoomDimensions, R>();
    cache.set(partitions, byDims);
    if (byDims.has(dims)) return byDims.get(dims) as R;
    const value = fn(dims, partitions);
    byDims.set(dims, value);
    return value;
  };
}

/** Стыки стен планировки этажа. */
export const cachedWallLayout: (dims: RoomDimensions, partitions: Partition[]) => WallLayout = memoByRefs(analyzeWalls);

/** Помещения планировки этажа. */
export const cachedRooms: (dims: RoomDimensions, partitions: Partition[]) => DetectedRoom[] = memoByRefs(detectRooms);
