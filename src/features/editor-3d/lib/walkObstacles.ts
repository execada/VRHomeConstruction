/**
 * Препятствия для хождения от первого лица и в VR: куски стен у пола (с учётом проёмов
 * и стыков), закрытые двери, открытые полотна с коробками, остекление окон.
 * Пустой дверной проём и открытая дверь проходимы; удалённая внешняя стена — тоже.
 * @module editor-3d/lib/walkObstacles
 */

import { add2, scale2, type Obb, type Vec2 } from '@/shared/lib/math/geometry2d';
import { doorFootprints } from './doors';
import { openingSill } from './openings';
import { wallAxis } from './wallAxes';
import type { WallLayout } from './wallJoints';
import { openingHole, wallBox, wallFrame, wallPieces, WALL_SIDES, type WallPiece } from './walls';
import type { Opening, OuterWalls, Partition, RoomDimensions, WallSide } from '../types';

/** Части сцены, от которых зависят препятствия. */
export interface WalkScene {
  dimensions: RoomDimensions;
  outerWalls: OuterWalls;
  removedWalls: WallSide[];
  openings: { [wallId: string]: Opening[] };
  partitions: Partition[];
}

/** Куски стены, начинающиеся ниже этой высоты, мешают пройти. */
const STEP_HEIGHT = 0.3;
const FAR = 1e3;

/** Стена в мировых координатах: середина по толщине, направление вдоль и нормаль. */
interface WallBasis {
  origin: Vec2;
  tangent: Vec2;
  normal: Vec2;
  angle: number;
  half: number;
}

const at = (b: WallBasis, u: number, z = 0): Vec2 => add2(add2(b.origin, scale2(b.tangent, u)), scale2(b.normal, z));

/** Куски стены у пола (под окнами, между проёмами). */
function lowPieces(uMin: number, uMax: number, height: number, openings: Opening[]): WallPiece[] {
  return wallPieces(uMin, uMax, height, openings.map(openingHole)).filter((p) => p.v0 < STEP_HEIGHT);
}

/** Окна до пола (стекло) и двери в проёмах. */
function openingObstacles(b: WallBasis, openings: Opening[], thickness: number): Obb[] {
  return openings.flatMap((o) => {
    const u = o.position[0];
    if (o.type === 'window') {
      return openingSill(o) < STEP_HEIGHT ? [{ center: at(b, u), half: [o.width / 2, b.half] as Vec2, angle: b.angle }] : [];
    }
    return doorFootprints(o, o.door, thickness).map((f) => ({ center: at(b, u + f.center[0], f.center[1]), half: f.half, angle: b.angle }));
  });
}

/** Препятствия внешней стены. */
function outerObstacles(scene: WalkScene, side: WallSide): Obb[] {
  const box = wallBox(side, scene.dimensions, scene.outerWalls, scene.removedWalls);
  const frame = wallFrame(side, scene.dimensions);
  const b: WallBasis = { origin: box.base, tangent: frame.tangent, normal: frame.normal, angle: box.rotationY, half: box.thickness / 2 };
  const openings = scene.openings[side] ?? [];
  const pieces = lowPieces(box.uMin, box.uMax, box.height, openings).map((p) => ({
    center: at(b, (p.u0 + p.u1) / 2),
    half: [(p.u1 - p.u0) / 2, b.half] as Vec2,
    angle: b.angle,
  }));
  return [...pieces, ...openingObstacles(b, openings, box.thickness)];
}

/** Препятствия внутренней стены (участки с учётом стыков). */
function interiorObstacles(partition: Partition, layout: WallLayout): Obb[] {
  const axis = wallAxis(partition);
  const b: WallBasis = { origin: axis.center, tangent: axis.tangent, normal: axis.normal, angle: partition.rotation[1], half: axis.half };
  const spans = layout.interior[partition.id]?.spans ?? [];
  const pieces = lowPieces(-axis.length / 2 - FAR, axis.length / 2 + FAR, partition.size[1], partition.openings).flatMap((p) =>
    spans.flatMap((s) => {
      const u0 = Math.max(p.u0, s.uMin);
      const u1 = Math.min(p.u1, s.uMax);
      return u1 - u0 > 1e-6 ? [{ center: at(b, (u0 + u1) / 2), half: [(u1 - u0) / 2, b.half] as Vec2, angle: b.angle }] : [];
    }),
  );
  return [...pieces, ...openingObstacles(b, partition.openings, partition.size[2])];
}

/**
 * Все препятствия стен и дверей для хождения.
 * @param scene - стены и проёмы
 * @param layout - стыки внутренних стен (см. analyzeWalls)
 */
export function walkObstacles(scene: WalkScene, layout: WallLayout): Obb[] {
  const outer = WALL_SIDES.filter((side) => !scene.removedWalls.includes(side)).flatMap((side) => outerObstacles(scene, side));
  return [...outer, ...scene.partitions.flatMap((p) => interiorObstacles(p, layout))];
}
