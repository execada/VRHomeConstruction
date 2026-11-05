/**
 * Геометрия участка: UV в «плитках» текстуры (плитка повторяется по всей поверхности,
 * а не растягивается) и фон-сфера, повёрнутая внутрь так же, как equirect-развёртка three.js.
 * @module editor-3d/lib/siteGeometry
 */

import { BufferGeometry, CircleGeometry, PlaneGeometry, SphereGeometry } from 'three';

/**
 * Умножить UV геометрии.
 * @param geometry - геометрия с атрибутом uv (меняется на месте, только что созданная)
 * @param u - множитель по u
 * @param v - множитель по v
 */
function scaleUv<T extends BufferGeometry>(geometry: T, u: number, v: number): T {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Круг земли с плиткой текстуры заданного размера.
 * @param radius - радиус, м
 * @param tileMeters - размер плитки текстуры, м
 * @param segments - число сегментов окружности
 */
export function tiledDisk(radius: number, tileMeters: number, segments = 128): CircleGeometry {
  const repeats = (2 * radius) / tileMeters;
  return scaleUv(new CircleGeometry(radius, segments), repeats, repeats);
}

/**
 * Прямоугольник с плиткой (терраса, фасад).
 * @param width - ширина, м
 * @param height - высота, м
 * @param tileWidth - ширина плитки или модуля, м
 * @param tileHeight - высота плитки или модуля, м
 */
export function tiledPlane(width: number, height: number, tileWidth: number, tileHeight = tileWidth): PlaneGeometry {
  return scaleUv(new PlaneGeometry(width, height), width / tileWidth, height / tileHeight);
}

/**
 * Единичная сфера фона, обращённая внутрь: направление d показывает пиксель
 * u = atan(d.z, d.x) / 2π + 0.5 — как equirect-фон three.js.
 */
export function backdropSphere(widthSegments = 96, heightSegments = 48): SphereGeometry {
  const geometry = new SphereGeometry(1, widthSegments, heightSegments);
  geometry.scale(1, 1, -1);
  return geometry;
}
