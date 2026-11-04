/**
 * Помощники для событий указателя в сцене: пересечение луча с полом и плоскостью стены,
 * луч для выбора поверхности опоры, захват указателя на время перетаскивания,
 * отличие клика от поворота камеры.
 * @module editor-3d/ui/scene/pointer
 */

import type { ThreeEvent } from '@react-three/fiber';
import { Plane, Vector3, type Ray } from 'three';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import type { Ray3 } from '../../lib/surfaces';
import { worldToWall, type WallFrame } from '../../lib/walls';

export type ScenePointerEvent = ThreeEvent<PointerEvent>;
export type SceneMouseEvent = ThreeEvent<MouseEvent>;

/** Для декоративных объектов (контуры выделения): не перехватывают клики. */
export const NO_RAYCAST = () => null;

/** Метка вспомогательных объектов редактора (выделение, кольцо поворота, призрак): не попадают в снимки и превью. */
export const HELPER_DATA = Object.freeze({ editorHelper: true });

/** Смещение указателя (px), после которого нажатие считается перетаскиванием камеры, а не кликом. */
export const CLICK_TOLERANCE_PX = 5;

const UP = new Vector3(0, 1, 0);

/** Точка пересечения луча с горизонтальной плоскостью y = height. */
export function rayToFloor(ray: Ray, height = 0): Vec2 | null {
  const hit = ray.intersectPlane(new Plane(UP, -height), new Vector3());
  return hit ? [hit.x, hit.z] : null;
}

/** Луч three.js → луч команд сцены (выбор поверхности опоры, на которую указывают). */
export function toRay3(ray: Ray): Ray3 {
  return { origin: [ray.origin.x, ray.origin.y, ray.origin.z], direction: [ray.direction.x, ray.direction.y, ray.direction.z] };
}

/** Точка пересечения луча с рабочей гранью стены в её локальных координатах. */
export function rayToWall(ray: Ray, frame: WallFrame, faceOffset = 0): { u: number; v: number } | null {
  const normal = new Vector3(frame.normal[0], 0, frame.normal[1]);
  const point = new Vector3(frame.origin[0], 0, frame.origin[1]).addScaledVector(normal, faceOffset);
  const hit = ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal, point), new Vector3());
  if (!hit) return null;
  const local = worldToWall(frame, [hit.x, hit.y, hit.z]);
  return { u: local.u, v: local.v };
}

/** Захватить указатель за объектом (события перетаскивания идут ему, даже вне объекта). */
export function capturePointer(e: ScenePointerEvent): void {
  (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
}

/** Отпустить захват указателя. */
export function releasePointer(e: ScenePointerEvent): void {
  const target = e.target as unknown as Element;
  if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
}

/** Был ли это клик (а не перетаскивание камеры). */
export function isClick(e: SceneMouseEvent): boolean {
  return e.delta <= CLICK_TOLERANCE_PX;
}
