/**
 * Хождение по зданию от первого лица и в VR: поверхности, на которые можно встать
 * (полы этажей, ступени лестниц, терраса и крыша, участок вокруг), и препятствия
 * с вертикальным диапазоном — стены, двери, мебель, лестницы, ограждения.
 *
 * Препятствие мешает, только если пересекает «тело» по высоте: от уровня чуть выше
 * ступней (порог, ступенька) до глаз. Поэтому стены верхнего этажа не мешают внизу,
 * а торец марша не мешает тому, кто поднимается по нему. Опора под ногами — самая
 * высокая поверхность не выше ступней + MAX_STEP: так по ступеням поднимаются,
 * а с края марша вбок шагнуть нельзя (там косоур).
 * @module editor-3d/lib/building/walk
 */

import { add2, type Obb, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import { furnitureFootprint, isFlatItem, itemSizes } from '../placement';
import { stairLayout, stairObstacles, stairSurfaceAt, type StairLayout } from '../stairs/stairs';
import { walkObstacles } from '../walkObstacles';
import type { WallLayout } from '../wallJoints';
import type { FloorContent, Stair } from '../../types';
import { floorRise, roofLevel, type FloorFrame } from './floors';
import { pointInRect, translateRect } from './rects';
import { floorSlabs, roofEdges, type SlabSource } from './slabs';

/** Самая высокая ступенька, на которую можно шагнуть (и спуститься, не падая), м. */
export const MAX_STEP = 0.35;
/** Низ «тела» над ступнями: ниже — порог, на него просто наступают, м. */
export const STEP_CLEAR = 0.3;
/** Высота ограждения террасы и крыши, м. */
export const ROOF_RAIL_HEIGHT = 1.1;
const RAIL_HALF = 0.03;

/** Препятствие в мировых координатах с диапазоном высот над землёй. */
export interface WalkObstacle {
  footprint: Obb;
  range: readonly [number, number];
}

/** Поверхность, на которую можно встать. */
type WalkSurface =
  | { kind: 'flat'; rect: Rect; height: number }
  | { kind: 'stair'; stair: Stair; layout: StairLayout; offset: Vec2; base: number };

/** Всё, что нужно для хождения по зданию (мировые координаты). */
export interface WalkWorld {
  obstacles: WalkObstacle[];
  surfaces: WalkSurface[];
  /** Участок: дальше него не уйти */
  bounds: Rect;
}

/** Этаж для хождения: положение, содержимое и стыки стен. */
export interface WalkFloor {
  frame: FloorFrame;
  content: FloorContent;
  layout: WallLayout;
}

const shifted = (footprint: Obb, offset: Vec2): Obb => ({ ...footprint, center: add2(footprint.center, offset) });

/** Препятствия мебели этажа (ковры и прочие плоские предметы не мешают). */
function furnitureObstacles(items: readonly FurnitureItem[], frame: FloorFrame): WalkObstacle[] {
  return items
    .filter((f) => !isFlatItem(f))
    .map((f) => {
      const bottom = frame.base + Math.max(0, f.position[1]);
      return { footprint: shifted(furnitureFootprint(f), frame.offset), range: [bottom, bottom + itemSizes(f).height] as const };
    });
}

/** Ограждение вдоль отрезка края крыши. */
function railObstacle(a: Vec2, b: Vec2, frame: FloorFrame, level: number): WalkObstacle {
  const alongX = Math.abs(b[1] - a[1]) < 1e-9;
  const length = alongX ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const center: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return {
    footprint: { center: add2(center, frame.offset), half: [length / 2, RAIL_HALF], angle: alongX ? 0 : Math.PI / 2 },
    range: [level, level + ROOF_RAIL_HEIGHT],
  };
}

/** Препятствия и поверхности одного этажа. */
function floorWalk(floor: WalkFloor, below: WalkFloor | null, above: WalkFloor | null, slab: number): Pick<WalkWorld, 'obstacles' | 'surfaces'> {
  const { frame, content } = floor;
  const walls = walkObstacles(content, floor.layout).map((o) => ({ footprint: shifted(o, frame.offset), range: [frame.base, frame.base + frame.height] as const }));
  const rise = floorRise(frame, slab);
  const stairs = content.stairs.map((stair) => ({ stair, layout: stairLayout(stair.kind, rise, stair.width) }));
  const stairWalls = stairs.flatMap(({ stair, layout }) =>
    stairObstacles(stair, layout).map((o) => ({ footprint: shifted(o.footprint, frame.offset), range: [frame.base + o.range[0], frame.base + o.range[1]] as const })),
  );
  const roof = roofLevel(frame, slab);
  const asSlab = (f: WalkFloor | null): SlabSource | null => f && { frame: f.frame, content: f.content };
  const rails = roofEdges(floor, asSlab(above)).map((e) => railObstacle(e.a, e.b, frame, roof));
  const slabs = floorSlabs(floor, asSlab(below), slab);
  const flat = (rects: Rect[], height: number): WalkSurface[] => rects.map((r) => ({ kind: 'flat', rect: translateRect(r, frame.offset), height }));
  return {
    obstacles: [...walls, ...furnitureObstacles(content.furniture, frame), ...stairWalls, ...rails],
    surfaces: [
      ...flat(slabs.floor.rects, frame.base),
      ...flat(slabs.ceiling.rects, roof),
      ...stairs.map(({ stair, layout }): WalkSurface => ({ kind: 'stair', stair, layout, offset: frame.offset, base: frame.base })),
    ],
  };
}

type FloorWalk = Pick<WalkWorld, 'obstacles' | 'surfaces'>;

/**
 * Сборщик мира для хождения с кэшем по этажам: при правке одного этажа (перетаскивание
 * мебели, дверь) пересчитывается только он, а соседи — лишь если изменились лестницы
 * этажа ниже или контур этажа выше (от них зависят вырезы и ограждения террас).
 */
export function createWalkBuilder(): (floors: readonly WalkFloor[], slab: number, lot: Rect) => WalkWorld {
  const cache = new WeakMap<FloorContent, { deps: readonly unknown[]; value: FloorWalk }>();
  const partOf = (floor: WalkFloor, below: WalkFloor | null, above: WalkFloor | null, slab: number): FloorWalk => {
    const deps = [floor.frame, floor.layout, below?.frame, below?.content.stairs, above?.frame, above?.content.dimensions, above?.content.outerWalls, slab];
    const hit = cache.get(floor.content);
    if (hit && hit.deps.every((d, k) => d === deps[k])) return hit.value;
    const value = floorWalk(floor, below, above, slab);
    cache.set(floor.content, { deps, value });
    return value;
  };
  return (floors, slab, lot) => {
    const parts = floors.map((floor, i) => partOf(floor, floors[i - 1] ?? null, floors[i + 1] ?? null, slab));
    return {
      obstacles: parts.flatMap((p) => p.obstacles),
      surfaces: [{ kind: 'flat', rect: lot, height: 0 }, ...parts.flatMap((p) => p.surfaces)],
      bounds: lot,
    };
  };
}

/**
 * Собрать мир для хождения.
 * @param floors - этажи снизу вверх
 * @param slab - толщина перекрытия
 * @param lot - участок вокруг здания (на уровне земли)
 */
export function buildWalkWorld(floors: readonly WalkFloor[], slab: number, lot: Rect): WalkWorld {
  return createWalkBuilder()(floors, slab, lot);
}

/**
 * Препятствия для тела на высоте ступней feet (рост до глаз — head).
 * @param world - мир для хождения
 * @param feet - высота ступней над землёй
 * @param head - высота глаз над ступнями
 */
export function obstaclesAt(world: WalkWorld, feet: number, head: number): Obb[] {
  const low = feet + STEP_CLEAR;
  const high = feet + head;
  return world.obstacles.filter((o) => o.range[0] < high && o.range[1] > low).map((o) => o.footprint);
}

/** Высота поверхности в точке (null — поверхность не под точкой). */
function surfaceHeight(surface: WalkSurface, point: Vec2): number | null {
  if (surface.kind === 'flat') return pointInRect(point, surface.rect) ? surface.height : null;
  const local: Vec2 = [point[0] - surface.offset[0], point[1] - surface.offset[1]];
  const h = stairSurfaceAt(surface.stair, surface.layout, local);
  return h === null ? null : surface.base + h;
}

/**
 * Опора под ногами: самая высокая поверхность в точке не выше ступней + MAX_STEP.
 * @param world - мир для хождения
 * @param point - точка на плане (мир)
 * @param feet - текущая высота ступней
 * @returns высота опоры или null (под точкой ничего нет)
 */
export function groundAt(world: WalkWorld, point: Vec2, feet: number): number | null {
  const limit = feet + MAX_STEP;
  return world.surfaces.reduce<number | null>((best, s) => {
    const h = surfaceHeight(s, point);
    return h !== null && h <= limit + 1e-9 && (best === null || h > best) ? h : best;
  }, null);
}
