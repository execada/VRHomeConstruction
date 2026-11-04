/**
 * Привязка концов внутренних стен при рисовании и перетаскивании: к концам других стен
 * (Г- и Х-узлы), к осям стен (Т-стык), к внутренним граням внешних стен, к углам 0/45/90°
 * от начала стены и к сетке. Точка всегда остаётся внутри комнаты.
 * @module editor-3d/lib/wallSnap
 */

import { add2, clamp, dot2, length2, normalize2, rotateLocal, scale2, snapTo, sub2, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import { lineIntersection, projectOnSegment } from '@/shared/lib/math/polygon';
import { wallAxis } from './wallAxes';
import { interiorRect } from './walls';
import type { Partition, RoomDimensions } from '../types';

/** Радиус привязки по умолчанию, м. */
export const SNAP_RADIUS = 0.25;
/** Допуск привязки угла, рад (≈ 6°). */
const ANGLE_TOLERANCE = (6 * Math.PI) / 180;
const ANGLE_STEP = Math.PI / 4;

/** К чему привязалась точка. */
export type SnapKind = 'endpoint' | 'wall' | 'outer' | 'angle' | 'grid' | 'none';

/** Результат привязки. */
export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
}

/** Параметры привязки. */
export interface SnapOptions {
  /** Радиус привязки, м */
  radius?: number;
  /** Начало рисуемой стены — для привязки угла и попадания на стены по направлению */
  from?: Vec2 | null;
  /** Шаг сетки (null — без сетки) */
  grid?: number | null;
  /** Стена, которую не учитывать (её конец перетаскивается) */
  excludeId?: string;
}

interface SnapLine {
  a: Vec2;
  b: Vec2;
  kind: 'wall' | 'outer';
}

const clampToRect = (p: Vec2, r: Rect): Vec2 => [clamp(p[0], r.minX, r.maxX), clamp(p[1], r.minZ, r.maxZ)];

function boundaryLines(r: Rect): SnapLine[] {
  const corners: Vec2[] = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
  return corners.map((a, i) => ({ a, b: corners[(i + 1) % 4], kind: 'outer' }));
}

/** Ближайший конец другой стены в радиусе. */
function nearestEndpoint(point: Vec2, partitions: Partition[], radius: number): Vec2 | null {
  const ends = partitions.flatMap((p) => {
    const axis = wallAxis(p);
    return [axis.a, axis.b];
  });
  const best = ends.reduce<{ p: Vec2; d: number } | null>((acc, p) => {
    const d = length2(sub2(p, point));
    return d <= radius && (!acc || d < acc.d) ? { p, d } : acc;
  }, null);
  return best?.p ?? null;
}

/** Привязка направления от `from` к углам, кратным 45°. */
function snapDirection(from: Vec2, point: Vec2): { point: Vec2; dir: Vec2 } | null {
  const d = sub2(point, from);
  const len = length2(d);
  if (len < 1e-6) return null;
  const angle = Math.atan2(d[1], d[0]);
  const snapped = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
  if (Math.abs(angle - snapped) > ANGLE_TOLERANCE) return null;
  const dir = rotateLocal([1, 0], -snapped);
  return { point: add2(from, scale2(dir, len)), dir };
}

/** Ближайшая линия (ось стены или грань внешней стены) в радиусе. */
function nearestLine(point: Vec2, lines: SnapLine[], radius: number): { line: SnapLine; closest: Vec2 } | null {
  const best = lines.reduce<{ line: SnapLine; closest: Vec2; d: number } | null>((acc, line) => {
    const proj = projectOnSegment(point, line.a, line.b);
    return proj.distance <= radius && (!acc || proj.distance < acc.d) ? { line, closest: proj.closest, d: proj.distance } : acc;
  }, null);
  return best ? { line: best.line, closest: best.closest } : null;
}

/** Попадание на линию по направлению рисования (точный Т-стык под выбранным углом). */
function alongDirection(from: Vec2, dir: Vec2, line: SnapLine, near: Vec2, radius: number): Vec2 | null {
  const hit = lineIntersection(from, dir, line.a, normalize2(sub2(line.b, line.a)));
  if (!hit || dot2(sub2(hit, from), dir) <= 0) return null;
  const onSegment = projectOnSegment(hit, line.a, line.b).distance < 1e-6;
  return onSegment && length2(sub2(hit, near)) <= radius ? hit : null;
}

/**
 * Привязать точку конца внутренней стены.
 * @param point - точка под курсором на полу
 * @param dims - размеры комнаты
 * @param partitions - внутренние стены
 * @param options - начало стены, сетка, исключаемая стена, радиус
 */
export function snapWallPoint(point: Vec2, dims: RoomDimensions, partitions: Partition[], options: SnapOptions = {}): SnapResult {
  const radius = options.radius ?? SNAP_RADIUS;
  const rect = interiorRect(dims);
  const others = partitions.filter((p) => p.id !== options.excludeId);
  const end = nearestEndpoint(point, others, radius);
  if (end) return { point: clampToRect(end, rect), kind: 'endpoint' };

  const directed = options.from ? snapDirection(options.from, point) : null;
  const candidate = directed?.point ?? point;
  const lines = [...others.map((p): SnapLine => ({ ...wallAxis(p), kind: 'wall' })), ...boundaryLines(rect)];
  const target = nearestLine(candidate, lines, radius);
  if (target) {
    const exact = directed && options.from ? alongDirection(options.from, directed.dir, target.line, candidate, radius) : null;
    return { point: clampToRect(exact ?? target.closest, rect), kind: target.line.kind };
  }
  if (directed) return { point: clampToRect(directed.point, rect), kind: 'angle' };
  if (options.grid) return { point: clampToRect([snapTo(point[0], options.grid), snapTo(point[1], options.grid)], rect), kind: 'grid' };
  return { point: clampToRect(point, rect), kind: 'none' };
}
