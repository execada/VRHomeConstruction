/**
 * Подготовка glTF-модели к сцене: клон на экземпляр, нормализация по габаритам
 * (низ на y = 0, центр по X/Z), тени, внешний вид (тонирование, призрак, ошибка).
 * @module furniture/lib/modelLook
 */

import { Box3, Color, Light, Material, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';

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

/** Клонировать сцену glTF, выключить встроенный свет, включить тени, измерить габариты. */
export function prepareModel(scene: Object3D): PreparedModel {
  const object = scene.clone(true);
  object.traverse((child) => {
    if (child instanceof Light) child.visible = false;
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
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
