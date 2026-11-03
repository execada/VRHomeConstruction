/**
 * Кэш разбора планировки: стыки стен и помещения пересчитываются только при изменении
 * размеров комнаты или стен (состояние неизменяемо — достаточно сравнения ссылок).
 * @module editor-3d/lib/layoutCache
 */

import { detectRooms, type DetectedRoom } from './rooms';
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
