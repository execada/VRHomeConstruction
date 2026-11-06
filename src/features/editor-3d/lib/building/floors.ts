/**
 * Этажи здания: высота пола каждого этажа над землёй, перевод координат «этаж ↔ мир»,
 * этаж под ногами, габариты здания и участок вокруг, новый этаж над верхним.
 *
 * Мир: пол первого этажа — плоскость y = 0. Пол этажа i+1 выше пола этажа i
 * на высоту этажа i и толщину перекрытия. Каждый этаж описан в своих координатах
 * (центр — его начало), смещение центра этажа — `offset`.
 * @module editor-3d/lib/building/floors
 */

import { add2, sub2, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { FloorContent, FloorMeta } from '../../types';
import { interiorRect, LOT_MARGIN, outerBounds } from '../walls';
import { boundingRect, translateRect } from './rects';

/** Толщина перекрытия по умолчанию и допустимый диапазон, м. */
export const DEFAULT_SLAB_THICKNESS = 0.3;
export const SLAB_THICKNESS_LIMITS = [0.15, 0.6] as const;
/** Чистовой пол (стяжка с покрытием) — верхний слой перекрытия, м. */
export const FLOOR_LAYER = 0.05;
/** Сколько этажей может быть в проекте. */
export const MAX_FLOORS = 5;
/** Длина названия этажа. */
export const FLOOR_NAME_LENGTH = 40;
/** id единственного этажа старых проектов и новой квартиры. */
export const FIRST_FLOOR_ID = 'floor-1';

/** Положение этажа в здании. */
export interface FloorFrame {
  id: string;
  index: number;
  /** Высота чистого пола над полом первого этажа, м */
  base: number;
  /** Высота этажа в свету (от пола до потолка), м */
  height: number;
  /** Смещение центра этажа [x, z], м */
  offset: Vec2;
}

/** Данные этажа, нужные для расчёта положения. */
export interface FrameSource {
  id: string;
  offset: Vec2;
  height: number;
}

/**
 * Положение всех этажей снизу вверх.
 * @param floors - этажи снизу вверх
 * @param slab - толщина перекрытия
 */
export function floorFrames(floors: readonly FrameSource[], slab: number): FloorFrame[] {
  return floors.reduce<FloorFrame[]>((acc, floor, index) => {
    const prev = acc[acc.length - 1];
    const base = prev ? prev.base + prev.height + slab : 0;
    return [...acc, { id: floor.id, index, base, height: floor.height, offset: floor.offset }];
  }, []);
}

/** Высота подъёма лестницы с этажа (до пола этажа выше или до крыши). */
export function floorRise(frame: Pick<FloorFrame, 'height'>, slab: number): number {
  return frame.height + slab;
}

/** Верх перекрытия над этажом (крыша или терраса, если этажа выше нет), над землёй. */
export function roofLevel(frame: Pick<FloorFrame, 'base' | 'height'>, slab: number): number {
  return frame.base + frame.height + slab - FLOOR_LAYER;
}

/** Точка этажа → мир. */
export function floorToWorld(frame: Pick<FloorFrame, 'offset'>, point: Vec2): Vec2 {
  return add2(point, frame.offset);
}

/** Точка мира → координаты этажа. */
export function worldToFloor(frame: Pick<FloorFrame, 'offset'>, point: Vec2): Vec2 {
  return sub2(point, frame.offset);
}

/**
 * Этаж под ногами: самый верхний, чей пол не выше ступней (с допуском —
 * на террасе крыши, чуть ниже пола этажа, человек уже на этом этаже).
 * @param frames - этажи снизу вверх
 * @param feet - высота ступней над землёй
 */
export function floorIndexAt(frames: readonly Pick<FloorFrame, 'base'>[], feet: number, tolerance = 0.12): number {
  const index = frames.reduce((found, f, i) => (f.base <= feet + tolerance ? i : found), 0);
  return Math.max(0, index);
}

/** Этаж с размерами и стенами — для габаритов здания. */
export interface FootprintSource {
  frame: Pick<FloorFrame, 'offset'>;
  content: Pick<FloorContent, 'dimensions' | 'outerWalls'>;
}

/** Внутренний прямоугольник этажа в мировых координатах. */
export function floorInterior(floor: FootprintSource): Rect {
  return translateRect(interiorRect(floor.content.dimensions), floor.frame.offset);
}

/** Прямоугольник этажа по внешним граням стен в мировых координатах. */
export function floorOuter(floor: FootprintSource): Rect {
  return translateRect(outerBounds(floor.content.dimensions, floor.content.outerWalls), floor.frame.offset);
}

/** Габариты здания на плане по внешним граням стен всех этажей. */
export function buildingBounds(floors: readonly FootprintSource[]): Rect {
  return boundingRect(floors.map(floorOuter)) ?? { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
}

/** Участок вокруг здания, по которому можно ходить: внутренние контуры этажей, расширенные на LOT_MARGIN. */
export function buildingLot(floors: readonly FootprintSource[]): Rect {
  const inner = boundingRect(floors.map(floorInterior)) ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return { minX: inner.minX - LOT_MARGIN, maxX: inner.maxX + LOT_MARGIN, minZ: inner.minZ - LOT_MARGIN, maxZ: inner.maxZ + LOT_MARGIN };
}

/** Название этажа по номеру снизу (с 0). */
export function floorName(index: number): string {
  return `${index + 1} этаж`;
}

/**
 * Новый этаж над верхним: тот же контур, конструкция стен, отделка и свет,
 * но без проёмов, внутренних стен, помещений, лестниц и мебели.
 * @param top - верхний этаж
 * @param index - номер нового этажа снизу (с 0)
 * @param id - id нового этажа
 */
export function floorAbove(top: { meta: FloorMeta; content: FloorContent }, index: number, id: string): { meta: FloorMeta; content: FloorContent } {
  const { content } = top;
  return {
    meta: { id, name: floorName(index), offset: top.meta.offset },
    content: {
      dimensions: content.dimensions,
      finishes: content.finishes,
      outerWalls: content.outerWalls,
      removedWalls: [],
      light: content.light,
      openings: {},
      partitions: [],
      rooms: [],
      stairs: [],
      furniture: [],
    },
  };
}
