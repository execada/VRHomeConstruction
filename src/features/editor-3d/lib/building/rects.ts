/**
 * Осевые прямоугольники на плане: сдвиг, пересечение, разность с отверстиями,
 * участки границы, не закрытые другим прямоугольником. Нужны перекрытиям (вырезы
 * под лестницы, терраса на крыше нижнего этажа) и ограждениям террас.
 * @module editor-3d/lib/building/rects
 */

import type { Rect, Vec2 } from '@/shared/lib/math/geometry2d';

const EPS = 1e-6;

/** Отрезок границы на плане: от a до b. */
export interface Segment {
  a: Vec2;
  b: Vec2;
}

/** Прямоугольник, сдвинутый на вектор. */
export function translateRect(rect: Rect, shift: Vec2): Rect {
  return { minX: rect.minX + shift[0], maxX: rect.maxX + shift[0], minZ: rect.minZ + shift[1], maxZ: rect.maxZ + shift[1] };
}

/** Пересечение прямоугольников (null — не пересекаются или касаются). */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  const r = { minX: Math.max(a.minX, b.minX), maxX: Math.min(a.maxX, b.maxX), minZ: Math.max(a.minZ, b.minZ), maxZ: Math.min(a.maxZ, b.maxZ) };
  return r.maxX - r.minX > EPS && r.maxZ - r.minZ > EPS ? r : null;
}

/** Прямоугольник, охватывающий все данные (null — список пуст). */
export function boundingRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return rects.reduce((acc, r) => ({
    minX: Math.min(acc.minX, r.minX),
    maxX: Math.max(acc.maxX, r.maxX),
    minZ: Math.min(acc.minZ, r.minZ),
    maxZ: Math.max(acc.maxZ, r.maxZ),
  }));
}

/** Площадь прямоугольника. */
export function rectArea(rect: Rect): number {
  return Math.max(0, rect.maxX - rect.minX) * Math.max(0, rect.maxZ - rect.minZ);
}

/** Лежит ли точка внутри прямоугольника (граница — внутри). */
export function pointInRect(point: Vec2, rect: Rect): boolean {
  return point[0] >= rect.minX - EPS && point[0] <= rect.maxX + EPS && point[1] >= rect.minZ - EPS && point[1] <= rect.maxZ + EPS;
}

/** Отсортированные уникальные значения. */
function breakpoints(values: number[]): number[] {
  return [...values].sort((a, b) => a - b).filter((v, i, list) => i === 0 || v - list[i - 1] > EPS);
}

/** Склеить соседние по X ячейки строки с одинаковыми границами по Z. */
function mergeRow(cells: Rect[]): Rect[] {
  return cells.reduce<Rect[]>((acc, cell) => {
    const last = acc[acc.length - 1];
    if (last && Math.abs(last.maxX - cell.minX) < EPS) return [...acc.slice(0, -1), { ...last, maxX: cell.maxX }];
    return [...acc, cell];
  }, []);
}

/** Склеить полосы одинаковой ширины, лежащие друг над другом по Z. */
function mergeColumns(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || a.minZ - b.minZ);
  return sorted.reduce<Rect[]>((acc, r) => {
    const index = acc.findIndex((o) => Math.abs(o.minX - r.minX) < EPS && Math.abs(o.maxX - r.maxX) < EPS && Math.abs(o.maxZ - r.minZ) < EPS);
    if (index < 0) return [...acc, r];
    return acc.map((o, i) => (i === index ? { ...o, maxZ: r.maxZ } : o));
  }, []);
}

/**
 * Разность «прямоугольник минус отверстия»: непересекающиеся прямоугольники,
 * покрывающие то, что осталось. Отверстия могут пересекаться и выходить за край.
 * @param rect - исходный прямоугольник
 * @param holes - вырезаемые прямоугольники
 */
export function subtractRects(rect: Rect, holes: readonly Rect[]): Rect[] {
  const cut = holes.map((h) => intersectRects(rect, h)).filter((h): h is Rect => h !== null);
  if (cut.length === 0) return [rect];
  const xs = breakpoints([rect.minX, rect.maxX, ...cut.flatMap((h) => [h.minX, h.maxX])]);
  const zs = breakpoints([rect.minZ, rect.maxZ, ...cut.flatMap((h) => [h.minZ, h.maxZ])]);
  const inHole = (x: number, z: number) => cut.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ);
  const rows = zs.slice(0, -1).flatMap((z0, j) => {
    const z1 = zs[j + 1];
    const cells = xs
      .slice(0, -1)
      .map((x0, i) => ({ minX: x0, maxX: xs[i + 1], minZ: z0, maxZ: z1 }))
      .filter((c) => !inHole((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2));
    return mergeRow(cells);
  });
  return mergeColumns(rows);
}

/** Свободные интервалы [lo, hi] за вычетом занятых. */
function freeSpans(lo: number, hi: number, blocked: Array<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const result: Array<[number, number]> = [];
  let cursor = lo;
  for (const [a, b] of sorted) {
    if (a > cursor + EPS) result.push([cursor, Math.min(a, hi)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < hi - EPS) result.push([cursor, hi]);
  return result.filter(([a, b]) => b - a > EPS);
}

/**
 * Участки границы прямоугольника, не закрытые другими прямоугольниками
 * (край крыши, над которым нет верхнего этажа, — там нужно ограждение).
 * @param rect - прямоугольник (крыша нижнего этажа)
 * @param covers - прямоугольники, закрывающие часть границы (верхний этаж)
 */
export function exposedEdges(rect: Rect, covers: readonly Rect[]): Segment[] {
  const along = (fixed: number, axis: 'x' | 'z'): Segment[] => {
    const [lo, hi] = axis === 'x' ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
    const blocked = covers.flatMap((c) => {
      const [cLo, cHi, fLo, fHi] = axis === 'x' ? [c.minX, c.maxX, c.minZ, c.maxZ] : [c.minZ, c.maxZ, c.minX, c.maxX];
      return fixed >= fLo - EPS && fixed <= fHi + EPS ? [[Math.max(lo, cLo), Math.min(hi, cHi)] as const] : [];
    });
    return freeSpans(lo, hi, blocked).map(([a, b]) =>
      axis === 'x' ? { a: [a, fixed] as Vec2, b: [b, fixed] as Vec2 } : { a: [fixed, a] as Vec2, b: [fixed, b] as Vec2 },
    );
  };
  return [...along(rect.minZ, 'x'), ...along(rect.maxZ, 'x'), ...along(rect.minX, 'z'), ...along(rect.maxX, 'z')];
}
