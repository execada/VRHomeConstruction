/**
 * Геометрия процедурных моделей на three.js (в Node): примитивы со скруглёнными кромками,
 * тела вращения, трубки, профили; сборщик модели, который сливает детали одного материала
 * в один меш и проецирует UV в реальном масштабе (текстура дерева или ткани не тянется).
 * Все размеры — в метрах, низ модели на y = 0, фасад смотрит в +Z.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Бокс со скруглёнными кромками (радиус 0 — острые кромки). */
export function box(width, height, depth, radius = 0.004) {
  if (radius <= 0) return new THREE.BoxGeometry(width, height, depth);
  const r = Math.min(radius, width / 2.01, height / 2.01, depth / 2.01);
  return new RoundedBoxGeometry(width, height, depth, 3, r);
}

/** Цилиндр (ось Y). */
export const cylinder = (radiusTop, radiusBottom, height, segments = 40) =>
  new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);

/** Тело вращения по профилю [радиус, высота]. */
export const lathe = (profile, segments = 56) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);

/** Трубка вдоль сглаженной ломаной. */
export const tube = (points, radius, segments = 64) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), segments, radius, 14);

/** Тор (кольцо) в плоскости XY. */
export const torus = (radius, thickness, segments = 64) => new THREE.TorusGeometry(radius, thickness, 16, segments);

/** Скруглённый прямоугольник как контур (для выдавливания). */
export function roundedRect(width, height, radius) {
  const shape = new THREE.Shape();
  const [x, y, r] = [-width / 2, -height / 2, Math.min(radius, width / 2, height / 2)];
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** Выдавить контур на глубину (ось Z) с фаской. */
export function extrude(shape, depth, bevel = 0.003) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  return geometry.translate(0, 0, -depth / 2);
}

/** Плоская фигура (зеркало, экран). */
export const flat = (shape) => new THREE.ShapeGeometry(shape, 16);

/** Привести геометрию к общему виду для слияния: индекс, нормали, UV. */
function normalizeAttributes(geometry) {
  const g = geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  ['uv1', 'uv2', 'tangent', 'color'].forEach((name) => g.deleteAttribute(name));
  return g;
}

/** UV в метрах по доминирующей оси нормали, делённые на размер плитки текстуры. */
function projectUVs(geometry, tile) {
  const { position, normal } = geometry.attributes;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const [nx, ny, nz] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

/** Сборщик модели: детали группируются по материалам. */
export class ModelBuilder {
  constructor() {
    this.parts = new Map();
  }

  /**
   * Добавить деталь.
   * @param {object} material - описание материала (materials.mjs)
   * @param {THREE.BufferGeometry} geometry - геометрия детали (в своих координатах)
   * @param {{ at?: number[], rotate?: number[], scale?: number[] }} transform - положение, поворот (рад), масштаб
   */
  add(material, geometry, { at = [0, 0, 0], rotate = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotate)),
      new THREE.Vector3(...scale),
    );
    const placed = normalizeAttributes(geometry.applyMatrix4(matrix));
    this.parts.set(material, [...(this.parts.get(material) ?? []), placed]);
    return this;
  }

  /** Слитые меши по материалам с UV в реальном масштабе. */
  build() {
    return [...this.parts.entries()].map(([material, geometries]) => {
      const merged = mergeGeometries(geometries, false);
      if (!merged) throw new Error(`Не удалось слить детали материала ${material.name}`);
      if (material.tile) projectUVs(merged, material.tile);
      return { material, geometry: merged };
    });
  }
}
