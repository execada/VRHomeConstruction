/**
 * Геометрия с UV в метрах (box-проекция).
 * UV = координата в метрах / размер тайла, поэтому текстура непрерывна на всех кусках
 * стены вокруг проёмов и не растягивается при изменении размеров.
 * @module textures/lib/uvGeometry
 */

import { BoxGeometry, BufferAttribute, BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, ShapeUtils, Vector2 } from 'three';

type Vec3 = readonly [number, number, number];

/**
 * Пересчитать UV геометрии проекцией по доминирующей оси нормали.
 * Геометрия должна быть только что созданной (функция задаёт её атрибут uv).
 * @param geometry - новая геометрия
 * @param offset - смещение геометрии в локальной системе поверхности (для непрерывности)
 * @param tile - размер тайла, м
 * @param topTile - размер тайла верхних граней (у стены верх — разрез с другим материалом)
 */
export function applyBoxProjectionUv<T extends BufferGeometry>(geometry: T, offset: Vec3, tile: number, topTile = tile): T {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sideSize = tile > 0 ? tile : 1;
  const topSize = topTile > 0 ? topTile : sideSize;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) + offset[0];
    const y = position.getY(i) + offset[1];
    const z = position.getZ(i) + offset[2];
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u = x;
    let v = y;
    if (ny >= nx && ny >= nz) v = z;
    else if (nx >= nz) u = z;
    const size = normal.getY(i) > 0.5 ? topSize : sideSize;
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}

/**
 * Бокс с UV в метрах.
 * @param size - размеры [x, y, z]
 * @param offset - смещение бокса в системе поверхности (для непрерывности текстуры)
 * @param tile - размер тайла, м
 * @param topTile - размер тайла верхней грани (по умолчанию как у остальных)
 */
export function boxWithUv(size: Vec3, offset: Vec3, tile: number, topTile = tile): BoxGeometry {
  return applyBoxProjectionUv(new BoxGeometry(size[0], size[1], size[2]), offset, tile, topTile);
}

/**
 * Бокс со скруглёнными вертикальными рёбрами на концах (скругление углов перегородки).
 * @param size - [длина, высота, толщина]
 * @param radius - радиус скругления (≤ половины толщины)
 * @param ends - какие концы скруглять
 */
export function roundedEndBox(
  size: Vec3,
  radius: number,
  ends: { start: boolean; end: boolean },
  offset: Vec3,
  tile: number,
  topTile = tile,
): BufferGeometry {
  const [length, height, thickness] = size;
  const r = Math.max(0, Math.min(radius, thickness / 2, length / 2));
  if (r < 1e-4 || (!ends.start && !ends.end)) return boxWithUv(size, offset, tile, topTile);

  const hl = length / 2;
  const ht = thickness / 2;
  const rs = ends.start ? r : 0;
  const re = ends.end ? r : 0;
  const shape = new Shape();
  shape.moveTo(-hl + rs, -ht);
  shape.lineTo(hl - re, -ht);
  if (re) shape.quadraticCurveTo(hl, -ht, hl, -ht + re);
  shape.lineTo(hl, ht - re);
  if (re) shape.quadraticCurveTo(hl, ht, hl - re, ht);
  shape.lineTo(-hl + rs, ht);
  if (rs) shape.quadraticCurveTo(-hl, ht, -hl, ht - rs);
  shape.lineTo(-hl, -ht + rs);
  if (rs) shape.quadraticCurveTo(-hl, -ht, -hl + rs, -ht);

  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 8 });
  // Форма построена в плоскости XY и выдавлена по Z: поворачиваем так, чтобы высота шла по Y.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2, 0);
  return applyBoxProjectionUv(geometry, offset, tile, topTile);
}

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];

/** Накопитель треугольников призмы. */
interface PrismBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
}

/** UV вершины проекцией по доминирующей оси нормали (как у boxWithUv). */
function projectUv(p: Point3, n: Point3, tile: number): [number, number] {
  const [ax, ay, az] = n.map(Math.abs);
  if (ay >= ax && ay >= az) return [p[0] / tile, p[2] / tile];
  return ax >= az ? [p[2] / tile, p[1] / tile] : [p[0] / tile, p[1] / tile];
}

/** Добавить треугольник с нужной нормалью (порядок вершин исправляется под нормаль). */
function pushTriangle(out: PrismBuffers, tri: [Point3, Point3, Point3], n: Point3, tile: number): void {
  const [a, b, c] = tri;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  for (const p of facing >= 0 ? [a, b, c] : [a, c, b]) {
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(n[0], n[1], n[2]);
    out.uvs.push(...projectUv(p, n, tile));
  }
}

/** Боковые грани призмы (внешние нормали). */
function prismSides(out: PrismBuffers, polygon: readonly Point2[], v0: number, v1: number, tile: number): void {
  const ccw = polygon.reduce((s, p, i) => s + p[0] * polygon[(i + 1) % polygon.length][1] - polygon[(i + 1) % polygon.length][0] * p[1], 0) > 0;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-7) return;
    const sign = ccw ? 1 : -1;
    const n: Point3 = [((b[1] - a[1]) / len) * sign, 0, (-(b[0] - a[0]) / len) * sign];
    const q: Point3[] = [[a[0], v0, a[1]], [b[0], v0, b[1]], [b[0], v1, b[1]], [a[0], v1, a[1]]];
    pushTriangle(out, [q[0], q[1], q[2]], n, tile);
    pushTriangle(out, [q[0], q[2], q[3]], n, tile);
  });
}

/** Горизонтальная грань призмы (низ или верх) на высоте y. */
function prismCap(out: PrismBuffers, polygon: readonly Point2[], y: number, up: boolean, tile: number): void {
  const contour = polygon.map(([x, z]) => new Vector2(x, z));
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
    const p = (m: number): Point3 => [polygon[m][0], y, polygon[m][1]];
    pushTriangle(out, [p(i), p(j), p(k)], [0, up ? 1 : -1, 0], tile);
  }
}

/**
 * Призма из многоугольника основания (x, z) между высотами v0 и v1 с UV в метрах.
 * Группы материалов: 0 — боковые грани и низ, 1 — верх (у стены — разрез с материалом конструкции).
 * @param polygon - основание (выпуклое или простое невыпуклое)
 * @param v0 - низ
 * @param v1 - верх
 * @param tile - размер тайла боковых граней, м
 * @param topTile - размер тайла верха, м
 */
export function prismWithUv(polygon: readonly Point2[], v0: number, v1: number, tile: number, topTile = tile): BufferGeometry {
  const out: PrismBuffers = { positions: [], normals: [], uvs: [] };
  const safe = (t: number) => (t > 0 ? t : 1);
  prismSides(out, polygon, v0, v1, safe(tile));
  prismCap(out, polygon, v0, false, safe(tile));
  const sideCount = out.positions.length / 3;
  prismCap(out, polygon, v1, true, safe(topTile));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(out.uvs, 2));
  geometry.addGroup(0, sideCount, 0);
  geometry.addGroup(sideCount, out.positions.length / 3 - sideCount, 1);
  return geometry;
}
