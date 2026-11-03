/**
 * Стыки внутренних стен: Г-образные (общий конец, срез «на ус»), Т-образные (конец на оси
 * другой стены или на внешней стене — торец по её грани), Х-образные (пересечение — более
 * поздняя стена режется на два участка) и многолучевые узлы.
 *
 * Результат — контуры участков каждой стены в её локальных координатах (u, d) без наложений
 * объёмов (нет мерцания совпадающих граней) и зоны стыков, где нельзя ставить проёмы.
 * @module editor-3d/lib/wallJoints
 */

import { add2, dot2, length2, normalize2, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { cross2, lineIntersection, perp2, polygonArea, projectOnSegment } from '@/shared/lib/math/polygon';
import { awayDirection, endPoint, fromAxisLocal, toAxisLocal, wallAxis, type WallAxis, type WallEnd } from './wallAxes';
import { interiorRect, wallFrame, WALL_SIDES } from './walls';
import type { Partition, RoomDimensions, WallSide } from '../types';

/** Допуск совпадения концов стен и попадания конца на ось или внешнюю стену, м. */
export const JOINT_TOLERANCE = 0.02;
/** Минимальный синус угла между стенами, при котором стык строится (иначе — плоский торец). */
const MIN_JOINT_SIN = Math.sin((10 * Math.PI) / 180);
/** Дальше этого (в полутолщинах) точки среза не уходят — иначе торец остаётся плоским. */
const MITER_LIMIT = 5;
const MIN_SPAN = 1e-3;

/** Интервал вдоль стены [u0, u1]. */
export type Interval = readonly [number, number];

/** Участок стены: выпуклый (как правило) контур в локальных (u, d) против часовой стрелки. */
export interface WallSpan {
  polygon: Vec2[];
  uMin: number;
  uMax: number;
}

/** Форма внутренней стены с учётом стыков. */
export interface InteriorWallShape {
  id: string;
  spans: WallSpan[];
  /** Участки вдоль u, занятые стыками (проёмы туда не ставятся) */
  blocked: Interval[];
}

/** Стыки всей планировки. */
export interface WallLayout {
  interior: Record<string, InteriorWallShape>;
  /** Зоны примыкания внутренних стен к внешним (u в системе внешней стены) */
  outer: Record<WallSide, Interval[]>;
}

/** Торец в мировых координатах: от левой грани к правой (если смотреть внутрь стены). */
type Cap = Vec2[];

interface EndRef {
  index: number;
  end: WallEnd;
}

interface Context {
  axes: WallAxis[];
  partitions: Partition[];
  dims: RoomDimensions;
  /** Торцы: ключ `${index}:${end}` */
  caps: Map<string, Cap>;
  blocked: Interval[][];
  outer: Record<WallSide, Interval[]>;
  /** Разрезы стен пересечениями: index → [{ endCap участка слева, startCap участка справа }] */
  splits: Map<number, Array<{ left: Vec2[]; right: Vec2[]; u: number }>>;
}

const capKey = (index: number, end: WallEnd) => `${index}:${end}`;

const span = (points: readonly Vec2[]): Interval => {
  const us = points.map((p) => p[0]);
  return [Math.min(...us), Math.max(...us)];
};

/** Плоский торец (свободный конец); со скруглением — дуги по углам. */
function freeCap(axis: WallAxis, end: WallEnd, radius: number): Cap {
  const n = endPoint(axis, end);
  const w = awayDirection(axis, end);
  const p = perp2(w);
  const h = axis.half;
  const r = Math.min(Math.max(0, radius), h);
  if (r < 1e-4) return [add2(n, scale2(p, h)), sub2(n, scale2(p, h))];
  const left = add2(add2(n, scale2(p, h - r)), scale2(w, r));
  const right = add2(sub2(n, scale2(p, h - r)), scale2(w, r));
  const arc = (c: Vec2, a: Vec2, b: Vec2) =>
    Array.from({ length: 7 }, (_, k) => {
      const t = (k / 6) * (Math.PI / 2);
      return add2(c, add2(scale2(a, r * Math.cos(t)), scale2(b, r * Math.sin(t))));
    });
  return [...arc(left, p, scale2(w, -1)), ...arc(right, scale2(w, -1), scale2(p, -1))];
}

/** Торец по прямой (грань другой стены или внутренняя грань внешней стены). */
function lineCap(axis: WallAxis, end: WallEnd, linePoint: Vec2, lineDir: Vec2): Cap | null {
  const w = awayDirection(axis, end);
  if (Math.abs(cross2(w, normalize2(lineDir))) < MIN_JOINT_SIN) return null;
  const n = endPoint(axis, end);
  const p = perp2(w);
  const left = lineIntersection(add2(n, scale2(p, axis.half)), w, linePoint, lineDir);
  const right = lineIntersection(sub2(n, scale2(p, axis.half)), w, linePoint, lineDir);
  if (!left || !right) return null;
  const limit = MITER_LIMIT * axis.half + JOINT_TOLERANCE * 2;
  return length2(sub2(left, n)) > limit || length2(sub2(right, n)) > limit ? null : [left, right];
}

/** Сгруппировать концы стен, совпадающие с точностью до допуска. */
function clusterEnds(axes: WallAxis[]): EndRef[][] {
  const clusters: Array<{ point: Vec2; members: EndRef[] }> = [];
  axes.forEach((axis, index) => {
    ([0, 1] as const).forEach((end) => {
      const point = endPoint(axis, end);
      const hit = clusters.find((c) => length2(sub2(c.point, point)) <= JOINT_TOLERANCE);
      if (hit) hit.members.push({ index, end });
      else clusters.push({ point, members: [{ index, end }] });
    });
  });
  return clusters.map((c) => c.members);
}

interface NodeItem extends EndRef {
  axis: WallAxis;
  /** Направление от узла внутрь стены */
  w: Vec2;
  /** Левая нормаль к w */
  p: Vec2;
  origin: Vec2;
  angle: number;
}

/**
 * Угол сектора между соседними стенами узла: левая грань `a` ∩ правая грань `b`.
 * Для стен-продолжений (почти параллельных, в разные стороны) — проекции узла на свои грани;
 * null — стены почти совпадают по направлению (срез невозможен).
 */
function sectorCorners(a: NodeItem, b: NodeItem): { forA: Vec2; forB: Vec2 } | null {
  const leftOfA = add2(a.origin, scale2(a.p, a.axis.half));
  const rightOfB = sub2(b.origin, scale2(b.p, b.axis.half));
  if (Math.abs(cross2(a.w, b.w)) < MIN_JOINT_SIN) return dot2(a.w, b.w) < 0 ? { forA: leftOfA, forB: rightOfB } : null;
  const corner = lineIntersection(leftOfA, a.w, rightOfB, b.w);
  return corner ? { forA: corner, forB: corner } : null;
}

/** Срез «на ус» в узле из нескольких стен (углы между соседями по кругу). */
function miterCaps(ctx: Context, members: EndRef[]): boolean {
  const node = endPoint(ctx.axes[members[0].index], members[0].end);
  const items: NodeItem[] = members
    .map((m) => {
      const axis = ctx.axes[m.index];
      const w = awayDirection(axis, m.end);
      return { ...m, axis, w, p: perp2(w), origin: endPoint(axis, m.end), angle: Math.atan2(w[1], w[0]) };
    })
    .sort((x, y) => x.angle - y.angle);
  const sectors = items.map((item, k) => sectorCorners(item, items[(k + 1) % items.length]));
  const limit = MITER_LIMIT * Math.max(...items.map((i) => i.axis.half));
  const valid = (c: { forA: Vec2; forB: Vec2 } | null): c is { forA: Vec2; forB: Vec2 } =>
    c !== null && length2(sub2(c.forA, node)) <= limit && length2(sub2(c.forB, node)) <= limit;
  if (!sectors.every(valid)) return false;
  items.forEach((item, k) => {
    const left = sectors[k]!.forA;
    const right = sectors[(k - 1 + items.length) % items.length]!.forB;
    ctx.caps.set(capKey(item.index, item.end), items.length >= 3 ? [left, node, right] : [left, right]);
  });
  return true;
}

/** Стена, на ось которой (не у её концов) попадает конец стены. */
function findHost(ctx: Context, index: number, end: WallEnd): { host: number; side: number } | null {
  const point = endPoint(ctx.axes[index], end);
  const w = awayDirection(ctx.axes[index], end);
  for (let j = 0; j < ctx.axes.length; j += 1) {
    const h = ctx.axes[j];
    if (j === index) continue;
    const proj = projectOnSegment(point, h.a, h.b);
    const inside = proj.t * h.length > JOINT_TOLERANCE && (1 - proj.t) * h.length > JOINT_TOLERANCE;
    if (inside && proj.distance <= h.half + JOINT_TOLERANCE) return { host: j, side: dot2(w, h.normal) >= 0 ? 1 : -1 };
  }
  return null;
}

/** Т-стык с другой внутренней стеной: торец по её грани, зона стыка на ней. */
function hostCap(ctx: Context, index: number, end: WallEnd): boolean {
  const found = findHost(ctx, index, end);
  if (!found) return false;
  const h = ctx.axes[found.host];
  const cap = lineCap(ctx.axes[index], end, add2(h.center, scale2(h.normal, found.side * h.half)), h.tangent);
  if (!cap) return false;
  ctx.caps.set(capKey(index, end), cap);
  ctx.blocked[found.host].push(span(cap.map((c) => toAxisLocal(h, c))));
  return true;
}

/** Т-стык с внешней стеной: торец по её внутренней грани, зона стыка на ней. */
function boundaryCap(ctx: Context, index: number, end: WallEnd): boolean {
  const rect = interiorRect(ctx.dims);
  const point = endPoint(ctx.axes[index], end);
  const lines: Array<{ side: WallSide; on: boolean; at: Vec2; dir: Vec2 }> = [
    { side: 'left', on: Math.abs(point[0] - rect.minX) <= JOINT_TOLERANCE, at: [rect.minX, 0], dir: [0, 1] },
    { side: 'right', on: Math.abs(point[0] - rect.maxX) <= JOINT_TOLERANCE, at: [rect.maxX, 0], dir: [0, 1] },
    { side: 'back', on: Math.abs(point[1] - rect.minZ) <= JOINT_TOLERANCE, at: [0, rect.minZ], dir: [1, 0] },
    { side: 'front', on: Math.abs(point[1] - rect.maxZ) <= JOINT_TOLERANCE, at: [0, rect.maxZ], dir: [1, 0] },
  ];
  const w = awayDirection(ctx.axes[index], end);
  const best = lines.filter((l) => l.on).sort((a, b) => Math.abs(cross2(w, b.dir)) - Math.abs(cross2(w, a.dir)))[0];
  const cap = best ? lineCap(ctx.axes[index], end, best.at, best.dir) : null;
  if (!best || !cap) return false;
  ctx.caps.set(capKey(index, end), cap);
  const frame = wallFrame(best.side, ctx.dims);
  const us = cap.map((c) => dot2(sub2(c, frame.origin), frame.tangent));
  ctx.outer[best.side].push([Math.min(...us), Math.max(...us)]);
  return true;
}

/** Торцы всех концов: узлы, Т-стыки, примыкания к внешним стенам, свободные концы. */
function resolveCaps(ctx: Context): void {
  for (const members of clusterEnds(ctx.axes)) {
    if (members.length >= 2 && miterCaps(ctx, members)) continue;
    for (const { index, end } of members) {
      if (members.length < 2 && (hostCap(ctx, index, end) || boundaryCap(ctx, index, end))) continue;
      ctx.caps.set(capKey(index, end), freeCap(ctx.axes[index], end, ctx.partitions[index].cornerRadius ?? 0));
    }
  }
}

/** Точки пересечения граней стены `cut` с гранью `face` (±1) стены `by` — в локальных координатах `cut`. */
function faceCut(cut: WallAxis, by: WallAxis, face: number): { left: Vec2; right: Vec2 } | null {
  const at = add2(by.center, scale2(by.normal, face * by.half));
  const left = lineIntersection(add2(cut.center, scale2(cut.normal, cut.half)), cut.tangent, at, by.tangent);
  const right = lineIntersection(sub2(cut.center, scale2(cut.normal, cut.half)), cut.tangent, at, by.tangent);
  return left && right ? { left: toAxisLocal(cut, left), right: toAxisLocal(cut, right) } : null;
}

/** Х-образное пересечение двух стен в их средних частях: более поздняя (j) режется. */
function resolveCrossing(ctx: Context, i: number, j: number): void {
  const a = ctx.axes[i];
  const b = ctx.axes[j];
  if (Math.abs(cross2(a.tangent, b.tangent)) < MIN_JOINT_SIN) return;
  const x = lineIntersection(a.a, a.tangent, b.a, b.tangent);
  if (!x) return;
  const ua = dot2(sub2(x, a.a), a.tangent);
  const ub = dot2(sub2(x, b.a), b.tangent);
  const inA = ua > b.half + JOINT_TOLERANCE && ua < a.length - b.half - JOINT_TOLERANCE;
  const inB = ub > a.half + JOINT_TOLERANCE && ub < b.length - a.half - JOINT_TOLERANCE;
  const plus = inA && inB ? faceCut(b, a, 1) : null;
  const minus = inA && inB ? faceCut(b, a, -1) : null;
  if (!plus || !minus) return;
  const [near, far] = plus.left[0] + plus.right[0] < minus.left[0] + minus.right[0] ? [plus, minus] : [minus, plus];
  const list = ctx.splits.get(j) ?? [];
  ctx.splits.set(j, [...list, { left: [near.right, near.left], right: [far.left, far.right], u: ub - b.length / 2 }]);
  const corners = [near.left, near.right, far.left, far.right];
  ctx.blocked[j].push(span(corners));
  ctx.blocked[i].push(span(corners.map((c) => toAxisLocal(a, fromAxisLocal(b, c)))));
}

/** Участок из торцов (локальные координаты); null — если торцы перекрываются. */
function makeSpan(startCap: Vec2[], endCap: Vec2[]): WallSpan | null {
  const polygon = [...endCap, ...startCap];
  const startTop = startCap[0][0];
  const startBottom = startCap[startCap.length - 1][0];
  const endBottom = endCap[0][0];
  const endTop = endCap[endCap.length - 1][0];
  if (endTop - startTop < MIN_SPAN || endBottom - startBottom < MIN_SPAN || polygonArea(polygon) <= 0) return null;
  const [uMin, uMax] = span(polygon);
  return { polygon, uMin, uMax };
}

/** Зоны торцов стены (срезы на стыках, скругления), где проёмы недопустимы. */
function endZones(axis: WallAxis, startCap: Vec2[], endCap: Vec2[]): Interval[] {
  const half = axis.length / 2;
  const startTrim = Math.max(...startCap.map((p) => p[0]));
  const endTrim = Math.min(...endCap.map((p) => p[0]));
  const zones: Interval[] = [];
  if (startTrim > -half + 1e-4) zones.push([-half, startTrim]);
  if (endTrim < half - 1e-4) zones.push([endTrim, half]);
  return zones;
}

/** Форма одной стены: участки (с разрезами пересечений) и зоны стыков. */
function wallShape(ctx: Context, index: number): InteriorWallShape {
  const axis = ctx.axes[index];
  const local = (end: WallEnd) => (ctx.caps.get(capKey(index, end)) ?? freeCap(axis, end, 0)).map((p) => toAxisLocal(axis, p));
  const startCap = local(0);
  const endCap = local(1);
  const cuts = [...(ctx.splits.get(index) ?? [])].sort((a, b) => a.u - b.u);
  const starts = [startCap, ...cuts.map((c) => c.right)];
  const ends = [...cuts.map((c) => c.left), endCap];
  const spans = starts.map((s, k) => makeSpan(s, ends[k])).filter((s): s is WallSpan => s !== null);
  const flat = () => makeSpan(...([0, 1] as const).map((end) => freeCap(axis, end, 0).map((p) => toAxisLocal(axis, p))) as [Vec2[], Vec2[]]);
  const shapes = spans.length > 0 ? spans : [flat()].filter((s): s is WallSpan => s !== null);
  const id = ctx.partitions[index].id;
  return { id, spans: shapes, blocked: [...endZones(axis, startCap, endCap), ...ctx.blocked[index]] };
}

/**
 * Разобрать планировку: торцы, участки и зоны стыков всех внутренних стен.
 * @param dims - размеры комнаты (внутренние грани внешних стен)
 * @param partitions - внутренние стены
 */
export function analyzeWalls(dims: RoomDimensions, partitions: Partition[]): WallLayout {
  const ctx: Context = {
    axes: partitions.map(wallAxis),
    partitions,
    dims,
    caps: new Map(),
    blocked: partitions.map(() => []),
    outer: { front: [], back: [], left: [], right: [] },
    splits: new Map(),
  };
  resolveCaps(ctx);
  ctx.axes.forEach((_, i) => ctx.axes.forEach((__, j) => j > i && resolveCrossing(ctx, i, j)));
  const interior = Object.fromEntries(partitions.map((p, index) => [p.id, wallShape(ctx, index)]));
  const outer = Object.fromEntries(WALL_SIDES.map((side) => [side, ctx.outer[side]])) as Record<WallSide, Interval[]>;
  return { interior, outer };
}
