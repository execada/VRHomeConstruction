/**
 * Настенные предметы: грани стен, на которые их вешают (внутренние грани внешних стен, кроме
 * удалённых, и обе грани каждой перегородки — с проёмами окон и дверей), выбор грани лучом
 * указателя или по точке плана, положение предмета на грани (задней стороной к стене с
 * небольшим зазором, фасадом в комнату) и ближайшее свободное место вдоль стены: предмет не
 * заходит в проёмы, за торцы и выше стены и не пересекается с мебелью (её проверяет вызывающий).
 * @module editor-3d/lib/wallMount
 */

import { add2, clamp, normalizeAngle, scale2, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { Ray3 } from './surfaces';
import { openingHole, partitionFrame, WALL_SIDES, wallFrame, wallToWorld, worldToWall, type WallFrame, type WallPiece } from './walls';
import type { Opening, Partition, RoomDimensions, WallSide } from '../types';

/** Грань стены, на которую вешают предметы: система координат (нормаль — в комнату) и проёмы в ней. */
export interface WallFace {
  frame: WallFrame;
  holes: readonly WallPiece[];
}

/** Что нужно знать о стенах этажа. */
export interface WallSource {
  dimensions: RoomDimensions;
  partitions: readonly Partition[];
  openings: Readonly<Record<string, readonly Opening[] | undefined>>;
  removedWalls: readonly WallSide[];
}

/** Габариты предмета (при его масштабе). */
export interface MountSizes {
  halfWidth: number;
  halfDepth: number;
  height: number;
}

/** Положение настенного предмета: центр на плане, поворот (фасадом от стены), высота низа. */
export interface WallPose {
  center: Vec2;
  angle: number;
  elevation: number;
}

/** Зазор между предметом и стеной, м (грани не мерцают). */
export const WALL_GAP = 0.004;
/** Без луча (план, клавиатура) предмет ищет стену не дальше этого от точки, м. */
export const WALL_REACH = 1.2;
/** Отступ от торцов грани и от проёмов, м. */
const EDGE = 0.02;
/** Шаг и предел поиска свободного места вдоль стены, м. */
const SLIDE_STEP = 0.02;
const MAX_SLIDE = 1.5;

/** Обе грани перегородки: «a» — по её нормали, «b» — с обратной стороны (u зеркально). */
function partitionFaces(partition: Partition): WallFace[] {
  const base = partitionFrame(partition);
  const half = partition.size[2] / 2;
  const holes = partition.openings.map(openingHole);
  const front: WallFrame = { ...base, id: `${partition.id}:a`, origin: add2(base.origin, scale2(base.normal, half)) };
  const back: WallFrame = {
    ...base,
    id: `${partition.id}:b`,
    origin: add2(base.origin, scale2(base.normal, -half)),
    tangent: scale2(base.tangent, -1),
    normal: scale2(base.normal, -1),
    rotationY: normalizeAngle(base.rotationY + Math.PI),
  };
  return [
    { frame: front, holes },
    { frame: back, holes: holes.map((h) => ({ ...h, u0: -h.u1, u1: -h.u0 })) },
  ];
}

/** Грани стен этажа, на которые можно вешать предметы. */
export function wallFaces(source: WallSource): WallFace[] {
  const outer = WALL_SIDES.filter((side) => !source.removedWalls.includes(side)).map((side) => ({
    frame: wallFrame(side, source.dimensions),
    holes: (source.openings[side] ?? []).map(openingHole),
  }));
  return [...outer, ...source.partitions.flatMap(partitionFaces)];
}

/**
 * Грань под лучом указателя: ближайшая по лучу, обращённая к нему лицом (изнутри комнаты),
 * точка попадания — в пределах грани.
 * @returns грань и точка на ней (u вдоль, v — высота) или null
 */
export function faceByRay(faces: readonly WallFace[], ray: Ray3): { face: WallFace; u: number; v: number } | null {
  let best: { face: WallFace; u: number; v: number; t: number } | null = null;
  for (const face of faces) {
    const { normal, origin, length, height } = face.frame;
    const facing = ray.direction[0] * normal[0] + ray.direction[2] * normal[1];
    if (facing > -1e-6) continue;
    const distance = (ray.origin[0] - origin[0]) * normal[0] + (ray.origin[2] - origin[1]) * normal[1];
    const t = -distance / facing;
    if (t <= 0 || (best && t >= best.t)) continue;
    const hit: [number, number, number] = [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
    const local = worldToWall(face.frame, hit);
    if (Math.abs(local.u) <= length / 2 && local.v >= 0 && local.v <= height) best = { face, u: local.u, v: local.v, t };
  }
  return best && { face: best.face, u: best.u, v: best.v };
}

/**
 * Ближайшая к точке плана грань со стороны точки, не дальше reach.
 * @returns грань и проекция точки на неё (u) или null
 */
export function nearestFace(faces: readonly WallFace[], point: Vec2, reach = WALL_REACH): { face: WallFace; u: number } | null {
  let best: { face: WallFace; u: number; distance: number } | null = null;
  for (const face of faces) {
    const local = worldToWall(face.frame, [point[0], 0, point[1]]);
    if (local.depth < -0.05) continue;
    const along = clamp(local.u, -face.frame.length / 2, face.frame.length / 2);
    const distance = Math.hypot(local.u - along, Math.max(0, local.depth));
    if (distance <= reach && (!best || distance < best.distance)) best = { face, u: local.u, distance };
  }
  return best && { face: best.face, u: best.u };
}

/** Положение предмета на грани: задней стороной к стене, центр по u, низ на высоте bottom. */
export function wallPose(face: WallFace, sizes: MountSizes, u: number, bottom: number): WallPose {
  const p = wallToWorld(face.frame, u, 0, sizes.halfDepth + WALL_GAP);
  return { center: [p[0], p[2]], angle: face.frame.rotationY, elevation: bottom };
}

/** Заходит ли предмет в проём (окно, дверь) грани. */
export function hitsOpening(face: WallFace, sizes: MountSizes, u: number, bottom: number): boolean {
  return face.holes.some(
    (h) => u + sizes.halfWidth > h.u0 - EDGE && u - sizes.halfWidth < h.u1 + EDGE && bottom + sizes.height > h.v0 - EDGE && bottom < h.v1 + EDGE,
  );
}

/** Результат подвеса: положение и можно ли там висеть. */
export interface WallResolution {
  pose: WallPose;
  u: number;
  valid: boolean;
}

/**
 * Место на грани: ближайшее к желаемому по горизонтали (на той же высоте), где предмет не
 * заходит за торцы, выше стены и в проёмы и где он свободен по мнению isFree (мебель).
 * @param face - грань
 * @param sizes - габариты предмета
 * @param u - желаемый центр вдоль грани
 * @param bottom - желаемая высота низа
 * @param isFree - свободно ли положение (столкновения с мебелью и перегородками)
 */
export function resolveOnFace(face: WallFace, sizes: MountSizes, u: number, bottom: number, isFree: (pose: WallPose) => boolean): WallResolution {
  const uMax = face.frame.length / 2 - sizes.halfWidth - EDGE;
  const top = face.frame.height - sizes.height;
  const low = clamp(bottom, 0, Math.max(0, top));
  if (uMax < 0 || top < 0) return { pose: wallPose(face, sizes, clamp(u, -face.frame.length / 2, face.frame.length / 2), low), u, valid: false };
  const start = clamp(u, -uMax, uMax);
  const fits = (cu: number) => !hitsOpening(face, sizes, cu, low) && isFree(wallPose(face, sizes, cu, low));
  for (let k = 0; k * SLIDE_STEP <= MAX_SLIDE; k += 1) {
    for (const cu of k === 0 ? [start] : [start + k * SLIDE_STEP, start - k * SLIDE_STEP]) {
      if (Math.abs(cu) <= uMax + 1e-9 && fits(cu)) return { pose: wallPose(face, sizes, cu, low), u: cu, valid: true };
    }
  }
  return { pose: wallPose(face, sizes, start, low), u: start, valid: false };
}

/**
 * Грань, на которой висит предмет: та, чья нормаль смотрит туда же, куда его фасад, и к чьей
 * плоскости предмет прижат (по проекции — в пределах грани).
 */
export function faceOfItem(faces: readonly WallFace[], center: Vec2, angle: number, halfDepth: number): { face: WallFace; u: number } | null {
  let best: { face: WallFace; u: number; gap: number } | null = null;
  for (const face of faces) {
    if (Math.abs(normalizeAngle(face.frame.rotationY - angle)) > 0.01) continue;
    const local = worldToWall(face.frame, [center[0], 0, center[1]]);
    const gap = Math.abs(local.depth - halfDepth - WALL_GAP);
    if (Math.abs(local.u) <= face.frame.length / 2 + 1e-6 && (!best || gap < best.gap)) best = { face, u: local.u, gap };
  }
  return best && { face: best.face, u: best.u };
}
