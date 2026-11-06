/**
 * Геометрия лестницы: число и высота подступёнков, глубина проступи (формула шага
 * 2h + b ≈ 63 см), длина марша и площадка; футпринт и вырез в перекрытии; высота ступени
 * под точкой (по ней идут от первого лица и в VR); профиль косоура и ограждения.
 *
 * Локальная система лестницы: начало — центр марша на полу, x — поперёк марша,
 * подъём идёт к −z. Вдоль марша отсчитывается t: 0 — нижний край, length — верхний
 * (выход на этаж выше). Поворот кратен 90°, поэтому вырез — осевой прямоугольник.
 * @module editor-3d/lib/stairs/stairs
 */

import { add2, clamp, dot2, normalizeAngle, obbBounds, rotateLocal, scale2, sub2, type Obb, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { Stair, StairKind } from '../../types';

/** Ограничения ширины марша, м. */
export const STAIR_WIDTH_LIMITS = [0.7, 2] as const;
/** Ширина новой лестницы, м. */
export const DEFAULT_STAIR_WIDTH = 1;
/** Названия вариантов лестницы. */
export const STAIR_KIND_LABELS: Record<StairKind, string> = {
  straight: 'Прямая лестница',
  landing: 'Лестница с площадкой',
};

/** Желаемая высота подступёнка и допустимые границы, м. */
const TARGET_RISER = 0.175;
const MAX_RISER = 0.2;
/** Формула удобного шага: 2 подступёнка + проступь ≈ 63 см. */
const STEP_RULE = 0.63;
const GOING_RANGE = [0.25, 0.32] as const;
/** Минимальная глубина площадки, м (не меньше ширины марша). */
const MIN_LANDING = 0.9;
/** Высота ограждения над ступенями и над перекрытием, м. */
export const HANDRAIL_HEIGHT = 0.9;
export const BALUSTRADE_HEIGHT = 1;
/** Толщина «стенок» лестницы для столкновений (косоуры, ограждение), м. */
const SIDE = 0.06;
const QUARTER = Math.PI / 2;

/** Раскладка ступеней марша. */
export interface StairLayout {
  /** Высота подъёма (до пола этажа выше), м */
  rise: number;
  /** Число подступёнков (подъёмов) */
  risers: number;
  /** Высота подступёнка, м */
  riser: number;
  /** Глубина проступи, м */
  going: number;
  /** Длина марша на плане, м */
  length: number;
  /** Площадка: участок вдоль марша [from, to] на высоте step × riser */
  landing: { from: number; to: number; step: number } | null;
}

/** Ступень (проступь) марша: участок вдоль марша и высота верха. */
export interface StairTread {
  step: number;
  from: number;
  to: number;
  top: number;
  /** Это площадка */
  landing: boolean;
}

/**
 * Раскладка ступеней по высоте подъёма.
 * @param kind - прямой марш или с площадкой посередине
 * @param rise - высота подъёма, м (высота этажа + перекрытие)
 * @param width - ширина марша (глубина площадки не меньше неё)
 */
export function stairLayout(kind: StairKind, rise: number, width: number = DEFAULT_STAIR_WIDTH): StairLayout {
  const risers = Math.max(2, Math.round(rise / TARGET_RISER), Math.ceil(rise / MAX_RISER - 1e-9));
  const riser = rise / risers;
  const going = clamp(STEP_RULE - 2 * riser, GOING_RANGE[0], GOING_RANGE[1]);
  if (kind === 'straight' || risers < 4) return { rise, risers, riser, going, length: (risers - 1) * going, landing: null };
  const step = Math.ceil(risers / 2);
  const depth = Math.max(MIN_LANDING, width);
  const from = (step - 1) * going;
  return { rise, risers, riser, going, length: (risers - 2) * going + depth, landing: { from, to: from + depth, step } };
}

/** Все проступи марша снизу вверх (площадка — одна из них). */
export function stairTreads(layout: StairLayout): StairTread[] {
  const { risers, riser, going, landing } = layout;
  return Array.from({ length: risers - 1 }, (_, i) => {
    const step = i + 1;
    if (landing && step === landing.step) return { step, from: landing.from, to: landing.to, top: step * riser, landing: true };
    const shift = landing && step > landing.step ? landing.to - landing.from - going : 0;
    return { step, from: (step - 1) * going + shift, to: step * going + shift, top: step * riser, landing: false };
  });
}

/**
 * Высота поверхности марша на расстоянии t от нижнего края (ступенчатая, как сами ступени).
 * До марша — пол (0), за верхним краем — пол этажа выше (rise).
 */
export function stairHeightAt(layout: StairLayout, t: number): number {
  if (t < 0) return 0;
  if (t >= layout.length) return layout.rise;
  const tread = stairTreads(layout).find((s) => t >= s.from - 1e-9 && t < s.to - 1e-9);
  return tread ? tread.top : layout.rise;
}

/** Направление подъёма на плане. */
export function stairAscent(stair: Pick<Stair, 'rotation'>): Vec2 {
  return rotateLocal([0, -1], stair.rotation);
}

/** Футпринт марша на полу. */
export function stairFootprint(stair: Stair, layout: StairLayout): Obb {
  return { center: stair.position, half: [stair.width / 2, layout.length / 2], angle: stair.rotation };
}

/** Вырез в перекрытии над лестницей (осевой прямоугольник: поворот кратен 90°). */
export function stairCutout(stair: Stair, layout: StairLayout): Rect {
  const b = obbBounds(stairFootprint(stair, layout));
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return { minX: round(b.minX), maxX: round(b.maxX), minZ: round(b.minZ), maxZ: round(b.maxZ) };
}

/**
 * Координаты точки в системе марша: t — вдоль подъёма от нижнего края, s — поперёк от оси.
 * @param stair - лестница
 * @param layout - раскладка ступеней
 * @param point - точка на плане этажа
 */
export function stairLocal(stair: Stair, layout: StairLayout, point: Vec2): { t: number; s: number } {
  const ascent = stairAscent(stair);
  const across = rotateLocal([1, 0], stair.rotation);
  const rel = sub2(point, stair.position);
  return { t: dot2(rel, ascent) + layout.length / 2, s: dot2(rel, across) };
}

/**
 * Высота ступени под точкой (null — точка не над маршем).
 * @param stair - лестница
 * @param layout - раскладка ступеней
 * @param point - точка на плане этажа
 */
export function stairSurfaceAt(stair: Stair, layout: StairLayout, point: Vec2): number | null {
  const { t, s } = stairLocal(stair, layout, point);
  if (Math.abs(s) > stair.width / 2 || t < 0 || t > layout.length) return null;
  return stairHeightAt(layout, t);
}

/** Точка на плане по координатам марша. */
function stairPoint(stair: Stair, layout: StairLayout, t: number, s: number): Vec2 {
  const ascent = stairAscent(stair);
  const across = rotateLocal([1, 0], stair.rotation);
  return add2(add2(stair.position, scale2(ascent, t - layout.length / 2)), scale2(across, s));
}

/** Препятствие для хождения с вертикальным диапазоном (над полом этажа лестницы). */
export interface StairObstacle {
  footprint: Obb;
  /** [низ, верх] над полом этажа, м */
  range: readonly [number, number];
}

/**
 * Препятствия лестницы: косоуры с ограждением по бокам (снизу до ограждения выреза
 * на этаже выше), торец под верхним краем (из-под марша не пройти) и ограждение
 * выреза у нижнего края на этаже выше. Нижний край открыт — с него поднимаются.
 */
export function stairObstacles(stair: Stair, layout: StairLayout): StairObstacle[] {
  const { length, rise } = layout;
  const half = stair.width / 2;
  const side = (s: number): StairObstacle => ({
    footprint: { center: stairPoint(stair, layout, length / 2, s), half: [SIDE / 2, length / 2], angle: stair.rotation },
    range: [0, rise + BALUSTRADE_HEIGHT],
  });
  const end = (t: number, range: readonly [number, number]): StairObstacle => ({
    footprint: { center: stairPoint(stair, layout, t, 0), half: [half, SIDE / 2], angle: stair.rotation },
    range,
  });
  return [side(-half + SIDE / 2), side(half - SIDE / 2), end(length + SIDE / 2, [0, rise]), end(SIDE / 2, [rise, rise + BALUSTRADE_HEIGHT])];
}

/** Линия носков ступеней в плоскости марша (t, высота); площадка — горизонтальный участок. */
export function nosingLine(layout: StairLayout): Vec2[] {
  const { riser, landing, length, rise } = layout;
  if (!landing) return [[0, riser], [length, rise]];
  const level = landing.step * riser;
  return [[0, riser], [landing.from, level], [landing.to, level], [landing.to, level + riser], [length, rise]];
}

/**
 * Профиль тетивы (боковой доски марша) в плоскости марша (t, высота): верх идёт
 * чуть выше носков ступеней, низ — на depth ниже и обрезан полом. Замкнутый многоугольник.
 * @param layout - раскладка ступеней
 * @param depth - высота сечения тетивы, м
 * @param lift - насколько верх тетивы выше носков, м
 */
export function stringerProfile(layout: StairLayout, depth: number, lift = 0.05): Vec2[] {
  const top = nosingLine(layout).map(([t, h]) => [t, h + lift] as Vec2);
  const lowered = [...top].reverse().map(([t, h]) => [t, h - depth] as Vec2);
  const bottom: Vec2[] = [];
  for (let i = 0; i < lowered.length; i += 1) {
    const p = lowered[i];
    if (p[1] >= 0) {
      bottom.push(p);
      continue;
    }
    const prev = lowered[i - 1] ?? p;
    const k = prev[1] > p[1] ? prev[1] / (prev[1] - p[1]) : 0;
    bottom.push([prev[0] + (p[0] - prev[0]) * k, 0]);
    break;
  }
  return [[0, 0], ...top, ...bottom];
}

/** Поворот, приведённый к ближайшему кратному 90° в (−π, π]. */
export function snapQuarter(angle: number): number {
  const snapped = normalizeAngle(Math.round(normalizeAngle(angle) / QUARTER) * QUARTER);
  return Math.abs(snapped + Math.PI) < 1e-9 ? Math.PI : snapped;
}

/** Лестница с допустимой шириной и поворотом. */
export function normalizeStair(stair: Stair): Stair {
  const width = clamp(Number.isFinite(stair.width) ? stair.width : DEFAULT_STAIR_WIDTH, STAIR_WIDTH_LIMITS[0], STAIR_WIDTH_LIMITS[1]);
  return { ...stair, width, rotation: snapQuarter(stair.rotation) };
}
