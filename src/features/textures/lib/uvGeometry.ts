/**
 * Геометрия с UV в метрах (box-проекция).
 * UV = координата в метрах / размер тайла, поэтому текстура непрерывна на всех кусках
 * стены вокруг проёмов и не растягивается при изменении размеров.
 * @module textures/lib/uvGeometry
 */

import { BoxGeometry, BufferAttribute, BufferGeometry, ExtrudeGeometry, Shape } from 'three';

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
