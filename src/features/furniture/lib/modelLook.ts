/**
 * Подготовка glTF-модели к сцене: клон на экземпляр, нормализация (реальные метры,
 * ось «вверх» Y, поправки манифеста — см. normalization), низ на y = 0 и центр по X/Z,
 * тени, внешний вид (тонирование, призрак, ошибка).
 * @module furniture/lib/modelLook
 */

import { Box3, Color, Group, Light, Material, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import {
  isIdentityNormalization,
  resolveNormalization,
  validateSize,
  type Normalization,
  type NormalizeOptions,
  type SizeIssue,
} from './normalization';

/** Габариты модели при scale = 1. */
export interface ModelSizes {
  halfWidth: number;
  halfDepth: number;
  height: number;
}

/** Нормализованная модель. */
export interface PreparedModel {
  object: Object3D;
  /** Смещение, при котором низ модели на полу, а центр — в начале координат */
  offset: [number, number, number];
  sizes: ModelSizes;
  /** Применённая нормализация (единицы, ось, масштаб, поворот) */
  normalization: Normalization;
  /** Размеры вне ожидаемого диапазона категории (после нормализации) */
  issues: SizeIssue[];
}

/** Внешний вид модели. */
export interface ModelLook {
  /** Цвет тонирования `#rrggbb` */
  tint?: string | null;
  /** Полупрозрачный призрак (предпросмотр размещения) */
  ghost?: boolean;
  /** Место недоступно — подсветка красным */
  invalid?: boolean;
}

const INVALID_COLOR = new Color('#e5484d');
const MIN_SIZE = 0.02;

/** Клон сцены: встроенный свет выключен, тени включены. */
function cloneForScene(scene: Object3D): Object3D {
  const object = scene.clone(true);
  object.traverse((child) => {
    if (child instanceof Light) child.visible = false;
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  object.updateMatrixWorld(true);
  return object;
}

/** Обёртка, применяющая поворот осей и масштаб нормализации к клону. */
function wrapNormalized(object: Object3D, n: Normalization): Object3D {
  const root = new Group();
  root.name = 'normalized';
  root.add(object);
  // Порядок YXZ: сначала исправление оси «вверх» (X), затем поворот фасадом к +Z (Y).
  root.rotation.set(n.rotationX, n.rotationY, 0, 'YXZ');
  root.scale.setScalar(n.scale);
  root.updateMatrixWorld(true);
  return root;
}

/**
 * Клонировать сцену glTF, выключить встроенный свет, включить тени, нормализовать
 * габариты (единицы, ось «вверх», поправки манифеста) и измерить результат.
 * @param scene - сцена glTF (общая для всех экземпляров, не изменяется)
 * @param options - категория модели и поправки из манифеста
 */
export function prepareModel(scene: Object3D, options: NormalizeOptions = {}): PreparedModel {
  const clone = cloneForScene(scene);
  const raw = new Box3().setFromObject(clone);
  const rawSize = raw.isEmpty() ? new Vector3(1, 1, 1) : raw.getSize(new Vector3());
  const normalization = raw.isEmpty() ? resolveNormalization(rawSize) : resolveNormalization(rawSize, options);
  const identity = isIdentityNormalization(normalization);
  const object = identity ? clone : wrapNormalized(clone, normalization);
  const box = identity ? raw : new Box3().setFromObject(object);
  const size = box.isEmpty() ? new Vector3(1, 1, 1) : box.getSize(new Vector3());
  const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
  return {
    object,
    offset: [-center.x, box.isEmpty() ? 0 : -box.min.y, -center.z],
    sizes: {
      halfWidth: Math.max(MIN_SIZE, size.x / 2),
      halfDepth: Math.max(MIN_SIZE, size.z / 2),
      height: Math.max(MIN_SIZE, size.y),
    },
    normalization,
    issues: box.isEmpty() ? [] : validateSize(size, options.category),
  };
}

/** Есть ли что применять (иначе материалы модели используются как есть). */
export function hasLook(look: ModelLook): boolean {
  return Boolean(look.tint || look.ghost || look.invalid);
}

/** Копия материала с внешним видом. */
function styledMaterial(source: Material, look: ModelLook): Material {
  const material = source.clone();
  if (material instanceof MeshStandardMaterial) {
    if (look.tint) material.color = material.color.clone().multiply(new Color(look.tint));
    if (look.invalid) material.emissive = INVALID_COLOR.clone().multiplyScalar(0.6);
  }
  if (look.ghost || look.invalid) {
    material.transparent = true;
    material.opacity = look.invalid ? 0.55 : 0.6;
    material.depthWrite = false;
  }
  return material;
}

/**
 * Применить внешний вид к клону модели: материалы клонируются (оригиналы общие для всех экземпляров).
 * @returns функция отката: возвращает исходные материалы и освобождает созданные
 */
export function applyLook(object: Object3D, look: ModelLook): () => void {
  const changed: Array<{ mesh: Mesh; material: Mesh['material']; castShadow: boolean }> = [];
  const created: Material[] = [];
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    changed.push({ mesh: child, material: child.material, castShadow: child.castShadow });
    const restyle = (m: Material) => {
      const next = styledMaterial(m, look);
      created.push(next);
      return next;
    };
    child.material = Array.isArray(child.material) ? child.material.map(restyle) : restyle(child.material);
    child.castShadow = !look.ghost && !look.invalid;
  });
  return () => {
    changed.forEach(({ mesh, material, castShadow }) => {
      mesh.material = material;
      mesh.castShadow = castShadow;
    });
    created.forEach((m) => m.dispose());
  };
}
