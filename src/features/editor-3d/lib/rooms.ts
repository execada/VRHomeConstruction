/**
 * Помещения из планировки стен. Внутренние грани внешних стен и оси внутренних стен
 * образуют плоский граф; его ограниченные грани — помещения. Чистая площадь считается
 * по граням стен: каждое ребро грани смещается внутрь на половину толщины своей стены.
 * Висячие стены (одним концом в помещении) обходятся по контуру, замкнутые «острова»
 * (кладовка посреди комнаты) вычитаются как отверстия, отдельно стоящие стены — по площади основания.
 * @module editor-3d/lib/rooms
 */

import { add2, dot2, length2, normalize2, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import {
  cross2,
  distanceToPolygonEdge,
  lineIntersection,
  perp2,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
} from '@/shared/lib/math/polygon';
import { wallAxis } from './wallAxes';
import { JOINT_TOLERANCE } from './wallJoints';
import { interiorRect } from './walls';
import type { Partition, RoomDimensions } from '../types';

/** Помещения меньше этой площади (по осям) не считаются, м². */
const MIN_ROOM_AREA = 0.25;

/** Помещение, найденное по планировке. */
export interface DetectedRoom {
  /** Контур по осям стен и граням внешних стен (для попадания точки) */
  outline: Vec2[];
  /** Контур по граням стен (чистая площадь) */
  inner: Vec2[];
  /** «Острова» внутри помещения по их наружным граням */
  holes: Vec2[][];
  /** Чистая площадь, м² */
  area: number;
  /** Периметр по граням стен, м */
  perimeter: number;
  /** Точка для подписи (внутри помещения, подальше от стен) */
  center: Vec2;
}

interface Segment {
  a: Vec2;
  b: Vec2;
  inset: number;
  wall: boolean;
}

interface Graph {
  vertices: Vec2[];
  /** Исходящие рёбра: вершина → [{ to, inset }] по возрастанию угла */
  out: Array<Array<{ to: number; inset: number; angle: number }>>;
}

function segments(dims: RoomDimensions, partitions: Partition[]): Segment[] {
  const r = interiorRect(dims);
  const c: Vec2[] = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
  const boundary = c.map((a, i): Segment => ({ a, b: c[(i + 1) % 4], inset: 0, wall: false }));
  const walls = partitions.map((p): Segment => {
    const axis = wallAxis(p);
    return { a: axis.a, b: axis.b, inset: axis.half, wall: true };
  });
  return [...boundary, ...walls];
}

/** Параметры (вдоль отрезков, 0..1) точек пересечения двух отрезков с допуском на касание. */
function intersect(s: Segment, t: Segment): [number, number] | null {
  const ds = sub2(s.b, s.a);
  const dt = sub2(t.b, t.a);
  const ls = length2(ds);
  const lt = length2(dt);
  if (Math.abs(cross2(normalize2(ds), normalize2(dt))) < 1e-6) return null;
  const x = lineIntersection(s.a, ds, t.a, dt);
  if (!x) return null;
  const u = dot2(sub2(x, s.a), ds) / (ls * ls);
  const v = dot2(sub2(x, t.a), dt) / (lt * lt);
  const okU = u >= -JOINT_TOLERANCE / ls && u <= 1 + JOINT_TOLERANCE / ls;
  const okV = v >= -JOINT_TOLERANCE / lt && v <= 1 + JOINT_TOLERANCE / lt;
  return okU && okV ? [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))] : null;
}

/** Номер вершины (точки ближе допуска сливаются). */
function vertexIndex(vertices: Vec2[], p: Vec2): number {
  const found = vertices.findIndex((v) => length2(sub2(v, p)) <= JOINT_TOLERANCE * 1.05);
  if (found >= 0) return found;
  vertices.push(p);
  return vertices.length - 1;
}

/** Плоский граф: отрезки разбиты в точках пересечений, вершины слиты, рёбра без повторов. */
function buildGraph(list: Segment[]): Graph {
  const cuts = list.map(() => [0, 1]);
  list.forEach((s, i) =>
    list.forEach((t, j) => {
      if (j <= i) return;
      const hit = intersect(s, t);
      if (hit) {
        cuts[i].push(hit[0]);
        cuts[j].push(hit[1]);
      }
    }),
  );
  const vertices: Vec2[] = [];
  const edges = new Map<string, { a: number; b: number; inset: number }>();
  list.forEach((s, i) => {
    const ids = [...new Set(cuts[i].sort((x, y) => x - y))].map((t) => vertexIndex(vertices, add2(s.a, scale2(sub2(s.b, s.a), t))));
    ids.slice(1).forEach((b, k) => {
      const a = ids[k];
      if (a === b) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, { a, b, inset: Math.max(s.inset, edges.get(key)?.inset ?? 0) });
    });
  });
  const out: Graph['out'] = vertices.map(() => []);
  const angle = (from: number, to: number) => Math.atan2(vertices[to][1] - vertices[from][1], vertices[to][0] - vertices[from][0]);
  edges.forEach(({ a, b, inset }) => {
    out[a].push({ to: b, inset, angle: angle(a, b) });
    out[b].push({ to: a, inset, angle: angle(b, a) });
  });
  out.forEach((list2) => list2.sort((x, y) => x.angle - y.angle));
  return { vertices, out };
}

/** Обход граней: каждая грань — цикл вершин (слева от рёбер) и отступы рёбер. */
function traceFaces(graph: Graph): Array<{ points: Vec2[]; insets: number[] }> {
  const visited = new Set<string>();
  const faces: Array<{ points: Vec2[]; insets: number[] }> = [];
  graph.out.forEach((list, start) =>
    list.forEach((first) => {
      if (visited.has(`${start}|${first.to}`)) return;
      const points: Vec2[] = [];
      const insets: number[] = [];
      let from = start;
      let edge = first;
      for (let guard = 0; guard < 10000 && !visited.has(`${from}|${edge.to}`); guard += 1) {
        visited.add(`${from}|${edge.to}`);
        points.push(graph.vertices[from]);
        insets.push(edge.inset);
        const around = graph.out[edge.to];
        const back = around.findIndex((e) => e.to === from);
        from = edge.to;
        edge = around[(back - 1 + around.length) % around.length];
      }
      faces.push({ points, insets });
    }),
  );
  return faces;
}

/**
 * Сместить каждое ребро многоугольника влево (внутрь грани, обходимой против часовой стрелки)
 * на свой отступ. Встречные рёбра (конец висячей стены) получают плоский торец.
 */
export function insetPolygon(points: readonly Vec2[], insets: readonly number[]): Vec2[] {
  const n = points.length;
  return points.flatMap((p, i) => {
    const prev = (i - 1 + n) % n;
    const dPrev = normalize2(sub2(p, points[prev]));
    const dNext = normalize2(sub2(points[(i + 1) % n], p));
    const offPrev = add2(p, scale2(perp2(dPrev), insets[prev]));
    const offNext = add2(p, scale2(perp2(dNext), insets[i]));
    if (Math.abs(cross2(dPrev, dNext)) < 1e-6) {
      const same = dot2(dPrev, dNext) > 0 && Math.abs(insets[prev] - insets[i]) < 1e-9;
      return same ? [offNext] : [offPrev, offNext];
    }
    return [lineIntersection(offPrev, dPrev, offNext, dNext) ?? offNext];
  });
}

/** Точка подписи: узел сетки внутри помещения, наиболее удалённый от стен. */
function labelPoint(inner: Vec2[], holes: Vec2[][]): Vec2 {
  const centroid = polygonCentroid(inner);
  const inside = (p: Vec2) => pointInPolygon(p, inner) && holes.every((h) => !pointInPolygon(p, h));
  const xs = inner.map((p) => p[0]);
  const zs = inner.map((p) => p[1]);
  const steps = 16;
  const candidates: Vec2[] = [centroid];
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      candidates.push([Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / steps, Math.min(...zs) + ((Math.max(...zs) - Math.min(...zs)) * j) / steps]);
    }
  }
  const score = (p: Vec2) => Math.min(distanceToPolygonEdge(p, inner), ...holes.map((h) => distanceToPolygonEdge(p, h)));
  const best = candidates.filter(inside).reduce<{ p: Vec2; s: number } | null>((acc, p) => {
    const s = score(p) + (p === centroid ? 0.05 : 0);
    return !acc || s > acc.s ? { p, s } : acc;
  }, null);
  return best?.p ?? centroid;
}

/** Отдельно стоящие стены (ни с чем не соприкасаются): их основание вычитается из площади. */
function floatingFootprints(list: Segment[]): Array<{ mid: Vec2; area: number }> {
  return list
    .filter((s, i) => s.wall && list.every((t, j) => j === i || !intersect(s, t)))
    .map((s) => ({ mid: scale2(add2(s.a, s.b), 0.5), area: length2(sub2(s.b, s.a)) * s.inset * 2 }));
}

/**
 * Найти помещения.
 * @param dims - размеры комнаты (контур квартиры по внутренним граням внешних стен)
 * @param partitions - внутренние стены
 * @returns помещения в порядке чтения плана (сверху вниз, слева направо)
 */
export function detectRooms(dims: RoomDimensions, partitions: Partition[]): DetectedRoom[] {
  const list = segments(dims, partitions);
  const faces = traceFaces(buildGraph(list)).map((f) => ({ ...f, area: polygonArea(f.points) }));
  const outer = faces.reduce((min, f) => (f.area < min.area ? f : min), faces[0]);
  const holes = faces.filter((f) => f !== outer && f.area < -1e-4).map((f) => insetPolygon(f.points, f.insets));
  const floating = floatingFootprints(list);
  const rooms = faces
    .filter((f) => f.area >= MIN_ROOM_AREA)
    .map((f): DetectedRoom => {
      const inner = insetPolygon(f.points, f.insets);
      const own = holes.filter((h) => pointInPolygon(h[0], f.points));
      const solid = floating.filter((w) => pointInPolygon(w.mid, f.points)).reduce((s, w) => s + w.area, 0);
      const area = Math.max(0, polygonArea(inner) - own.reduce((s, h) => s + Math.abs(polygonArea(h)), 0) - solid);
      return { outline: f.points, inner, holes: own, area, perimeter: polygonPerimeter(inner), center: labelPoint(inner, own) };
    });
  return rooms.sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]);
}

/** Помещение, в котором находится точка (с учётом «островов»). */
export function roomAt<T extends Pick<DetectedRoom, 'outline' | 'holes'>>(rooms: readonly T[], point: Vec2): T | null {
  return rooms.find((r) => pointInPolygon(point, r.outline) && r.holes.every((h) => !pointInPolygon(point, h))) ?? null;
}
