/**
 * Многоугольники и прямые на плоскости пола: площадь, периметр, принадлежность точки,
 * отсечение прямоугольником, пересечение прямых, расстояние до отрезка.
 * Ориентация — математическая в осях (x, z): положительная площадь — обход против часовой стрелки.
 * @module shared/lib/math/polygon
 */

import { add2, dot2, length2, scale2, sub2, type Vec2 } from './geometry2d';

const EPS = 1e-9;

/** Векторное произведение (z-компонента). */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** Вектор, повёрнутый на +90° (влево от направления). */
export const perp2 = (a: Vec2): Vec2 => [-a[1], a[0]];

/** Знаковая площадь многоугольника (формула шнурования). */
export function polygonArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) sum += cross2(points[i], points[(i + 1) % points.length]);
  return sum / 2;
}

/** Периметр замкнутого многоугольника. */
export function polygonPerimeter(points: readonly Vec2[]): number {
  return points.reduce((s, p, i) => s + length2(sub2(points[(i + 1) % points.length], p)), 0);
}

/** Лежит ли точка внутри многоугольника (луч вдоль +x; граница — неопределённо). */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const crosses = zi > point[1] !== zj > point[1] && point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Пересечение прямых p + s·d и q + t·e.
 * @returns точка или null, если прямые параллельны
 */
export function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denom = cross2(d, e);
  if (Math.abs(denom) < EPS) return null;
  const s = cross2(sub2(q, p), e) / denom;
  return add2(p, scale2(d, s));
}

/** Параметр проекции точки на отрезок [a, b] (0 — a, 1 — b) и расстояние до отрезка. */
export function projectOnSegment(point: Vec2, a: Vec2, b: Vec2): { t: number; distance: number; closest: Vec2 } {
  const ab = sub2(b, a);
  const len2 = dot2(ab, ab);
  const t = len2 < EPS ? 0 : Math.min(1, Math.max(0, dot2(sub2(point, a), ab) / len2));
  const closest = add2(a, scale2(ab, t));
  return { t, distance: length2(sub2(point, closest)), closest };
}

/** Отсечь многоугольник полуплоскостью dot(n, p) ≤ offset (Сазерленд — Ходжмен). */
function clipHalfPlane(polygon: readonly Vec2[], n: Vec2, offset: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const dc = dot2(n, cur) - offset;
    const dn = dot2(n, next) - offset;
    if (dc <= EPS) out.push(cur);
    if ((dc < -EPS && dn > EPS) || (dc > EPS && dn < -EPS)) {
      const k = dc / (dc - dn);
      out.push(add2(cur, scale2(sub2(next, cur), k)));
    }
  }
  return out;
}

/** Отсечь многоугольник прямоугольником [minX, maxX] × [minZ, maxZ]. */
export function clipPolygonToRect(polygon: readonly Vec2[], rect: { minX: number; maxX: number; minZ: number; maxZ: number }): Vec2[] {
  const planes: Array<[Vec2, number]> = [
    [[-1, 0], -rect.minX],
    [[1, 0], rect.maxX],
    [[0, -1], -rect.minZ],
    [[0, 1], rect.maxZ],
  ];
  return planes.reduce<Vec2[]>((poly, [n, offset]) => (poly.length ? clipHalfPlane(poly, n, offset) : poly), [...polygon]);
}

/** Центр масс многоугольника (для вырожденных — среднее вершин). */
export function polygonCentroid(points: readonly Vec2[]): Vec2 {
  const area = polygonArea(points);
  if (Math.abs(area) < EPS) {
    const sum = points.reduce<Vec2>((s, p) => add2(s, p), [0, 0]);
    return points.length ? scale2(sum, 1 / points.length) : [0, 0];
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const c = cross2(p, q);
    cx += (p[0] + q[0]) * c;
    cz += (p[1] + q[1]) * c;
  }
  return [cx / (6 * area), cz / (6 * area)];
}

/** Расстояние от точки до границы многоугольника. */
export function distanceToPolygonEdge(point: Vec2, polygon: readonly Vec2[]): number {
  return polygon.reduce((best, p, i) => Math.min(best, projectOnSegment(point, p, polygon[(i + 1) % polygon.length]).distance), Infinity);
}
