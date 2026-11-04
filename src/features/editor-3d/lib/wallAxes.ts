/**
 * Оси внутренних стен: концы, направления, перевод «мир ↔ локальные координаты стены».
 * Локальные координаты (u, d): u — вдоль стены от её центра (к концу b), d — поперёк,
 * в сторону нормали стены (локальная +Z перегородки). Стена занимает |d| ≤ толщина/2.
 * @module editor-3d/lib/wallAxes
 */

import { add2, dot2, rotateLocal, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { Partition } from '../types';

/** Ось внутренней стены. */
export interface WallAxis {
  id: string;
  center: Vec2;
  /** Начало (u = −length/2) */
  a: Vec2;
  /** Конец (u = +length/2) */
  b: Vec2;
  tangent: Vec2;
  /** Нормаль = tangent, повёрнутый на +90° */
  normal: Vec2;
  length: number;
  /** Половина толщины */
  half: number;
}

/** Ось стены из перегородки. */
export function wallAxis(partition: Pick<Partition, 'id' | 'position' | 'rotation' | 'size'>): WallAxis {
  const angle = partition.rotation[1];
  const tangent = rotateLocal([1, 0], angle);
  const center: Vec2 = [partition.position[0], partition.position[2]];
  const half = scale2(tangent, partition.size[0] / 2);
  return {
    id: partition.id,
    center,
    a: sub2(center, half),
    b: add2(center, half),
    tangent,
    normal: rotateLocal([0, 1], angle),
    length: partition.size[0],
    half: partition.size[2] / 2,
  };
}

/** Мировая точка → локальные (u, d). */
export function toAxisLocal(axis: WallAxis, point: Vec2): Vec2 {
  const rel = sub2(point, axis.center);
  return [dot2(rel, axis.tangent), dot2(rel, axis.normal)];
}

/** Локальные (u, d) → мировая точка. */
export function fromAxisLocal(axis: WallAxis, local: Vec2): Vec2 {
  return add2(add2(axis.center, scale2(axis.tangent, local[0])), scale2(axis.normal, local[1]));
}

/** Конец стены: 0 — начало (a), 1 — конец (b). */
export type WallEnd = 0 | 1;

/** Точка конца стены. */
export const endPoint = (axis: WallAxis, end: WallEnd): Vec2 => (end === 0 ? axis.a : axis.b);

/** Направление от конца внутрь стены. */
export const awayDirection = (axis: WallAxis, end: WallEnd): Vec2 => (end === 0 ? axis.tangent : scale2(axis.tangent, -1));
