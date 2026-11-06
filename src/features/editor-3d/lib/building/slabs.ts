/**
 * Перекрытия здания. Перекрытие между этажами — два слоя: снизу несущая плита (её низ —
 * потолок нижнего этажа), сверху чистовой пол верхнего этажа. У каждого этажа свой пол
 * (с вырезами под лестницы с этажа ниже) и своя плита над ним (с вырезами под свои
 * лестницы). Там, где над плитой нет этажа выше, её верх — крыша или терраса; по открытым
 * краям такой крыши ставится ограждение. Все прямоугольники — в координатах этажа.
 * @module editor-3d/lib/building/slabs
 */

import type { Rect, Vec2 } from '@/shared/lib/math/geometry2d';
import type { FloorContent, Stair } from '../../types';
import { stairCutout, stairLayout } from '../stairs/stairs';
import { interiorRect, outerBounds } from '../walls';
import { FLOOR_LAYER, floorRise, type FloorFrame } from './floors';
import { exposedEdges, intersectRects, subtractRects, translateRect, type Segment } from './rects';

/** Плита пола первого этажа (на грунте или на крыше высотки), м. */
export const GROUND_SLAB = 0.05;

/** Слой перекрытия: прямоугольники и высоты низа и верха относительно пола этажа. */
export interface SlabLayer {
  rects: Rect[];
  bottom: number;
  top: number;
}

/** Слои перекрытий одного этажа. */
export interface FloorSlabs {
  /** Чистовой пол (верх — на уровне пола этажа) */
  floor: SlabLayer;
  /** Плита над этажом: низ — потолок, верх — пол этажа выше, крыша или терраса */
  ceiling: SlabLayer;
}

/** Этаж для расчёта перекрытий. */
export interface SlabSource {
  frame: FloorFrame;
  content: Pick<FloorContent, 'dimensions' | 'outerWalls' | 'stairs'>;
}

/** Этаж ниже: для вырезов в полу нужны только его положение и лестницы. */
export interface SlabBelow {
  frame: FloorFrame;
  content: Pick<FloorContent, 'stairs'>;
}

/** Вырезы под лестницы этажа в его координатах. */
export function stairCutouts(stairs: readonly Stair[], rise: number): Rect[] {
  return stairs.map((s) => stairCutout(s, stairLayout(s.kind, rise, s.width)));
}

/** Перевести прямоугольники из координат одного этажа в координаты другого. */
function between(rects: readonly Rect[], from: Pick<FloorFrame, 'offset'>, to: Pick<FloorFrame, 'offset'>): Rect[] {
  const shift: Vec2 = [from.offset[0] - to.offset[0], from.offset[1] - to.offset[1]];
  return rects.map((r) => translateRect(r, shift));
}

/**
 * Перекрытия этажа: пол с вырезами под лестницы снизу (только внутри комнаты — под стенами
 * плиту не режем) и плита над этажом с вырезами под свои лестницы.
 * @param floor - этаж
 * @param below - этаж ниже (null — первый этаж)
 * @param slab - толщина перекрытия
 */
export function floorSlabs(floor: SlabSource, below: SlabBelow | null, slab: number): FloorSlabs {
  const outer = outerBounds(floor.content.dimensions, floor.content.outerWalls);
  const interior = interiorRect(floor.content.dimensions);
  const fromBelow = below ? between(stairCutouts(below.content.stairs, floorRise(below.frame, slab)), below.frame, floor.frame) : [];
  const holesBelow = fromBelow.map((r) => intersectRects(r, interior)).filter((r): r is Rect => r !== null);
  const own = stairCutouts(floor.content.stairs, floorRise(floor.frame, slab));
  const height = floor.content.dimensions.height;
  return {
    floor: { rects: subtractRects(outer, holesBelow), bottom: below ? -FLOOR_LAYER : -GROUND_SLAB, top: 0 },
    ceiling: { rects: subtractRects(outer, own), bottom: height, top: height + slab - FLOOR_LAYER },
  };
}

/**
 * Открытые края плиты над этажом — там, где над ней нет этажа выше (терраса или крыша):
 * по ним ставится ограждение. Координаты этажа.
 * @param floor - этаж
 * @param above - этаж выше (null — верхний этаж: открыт весь контур крыши)
 */
export function roofEdges(floor: SlabSource, above: SlabSource | null): Segment[] {
  const outer = outerBounds(floor.content.dimensions, floor.content.outerWalls);
  const covers = above ? between([outerBounds(above.content.dimensions, above.content.outerWalls)], above.frame, floor.frame) : [];
  return exposedEdges(outer, covers);
}

/** Есть ли открытая (не закрытая этажом выше) часть крыши этажа — то есть терраса или крыша. */
export function hasOpenRoof(floor: SlabSource, above: SlabSource | null): boolean {
  if (!above) return true;
  const outer = outerBounds(floor.content.dimensions, floor.content.outerWalls);
  const cover = between([outerBounds(above.content.dimensions, above.content.outerWalls)], above.frame, floor.frame);
  return subtractRects(outer, cover).length > 0;
}
