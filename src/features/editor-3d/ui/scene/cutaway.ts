/**
 * Эффект «кукольного домика»: стены между камерой и комнатой (и потолок при взгляде сверху)
 * становятся невидимыми, но продолжают отбрасывать тени — солнце по-прежнему
 * попадает в комнату только через окна. Срезанные поверхности не перехватывают клики.
 *
 * Невидимость достигается отключением записи цвета и глубины у собственного материала
 * поверхности (тени рисуются отдельным проходом и от этого не зависят). Состояние
 * синхронизируется каждый кадр, поэтому смена отделки во время среза безопасна.
 * Меши с `userData.hideOnCut` (рамы, стёкла) при срезе просто скрываются.
 * @module editor-3d/ui/scene/cutaway
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, type Camera, type Material, type Object3D } from 'three';

const noRaycast: Mesh['raycast'] = () => undefined;

function syncMaterial(material: Material, cut: boolean): void {
  if (material.userData.cut === cut) return;
  material.userData.cut = cut;
  material.colorWrite = !cut;
  material.depthWrite = !cut && !material.transparent;
}

/** Срезать или вернуть поверхность. */
export function applyCut(root: Object3D, cut: boolean): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    // Raycaster three.js не учитывает visible — отключаем попадания явно.
    child.raycast = cut ? noRaycast : Mesh.prototype.raycast;
    if (child.userData.hideOnCut) {
      child.visible = !cut;
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((m) => syncMaterial(m, cut));
  });
}

/**
 * Хук среза поверхности.
 * @param shouldCut - условие по положению камеры (null — срез выключен, например от первого лица)
 * @returns ref для группы поверхности
 */
export function useCutaway<T extends Object3D>(shouldCut: ((camera: Camera) => boolean) | null) {
  const ref = useRef<T>(null);
  useFrame(({ camera }) => {
    if (ref.current) applyCut(ref.current, shouldCut ? shouldCut(camera) : false);
  });
  return ref;
}
