/**
 * Позиции камеры: фиксированные виды и облёт активного этажа, облёт здания с улицы,
 * ограничения облёта, масштаб плана сверху.
 * @module camera/lib/views
 */

import type { RoomDimensions } from '@/features/editor-3d/types';
import type { Rect } from '@/shared/lib/math/geometry2d';
import type { FixedView } from '../types';

type Vec3 = [number, number, number];

/** Дальняя плоскость перспективных камер, м: земля и город вокруг квартиры видны почти до горизонта. */
export const CAMERA_FAR = 4000;

/** Положение камеры и точка, на которую она смотрит. */
export interface ViewPose {
  position: Vec3;
  target: Vec3;
}

/** Положение этажа в здании: высота пола и смещение центра. */
export interface ViewFrame {
  base: number;
  offset: readonly [number, number];
}

const GROUND_FRAME: ViewFrame = { base: 0, offset: [0, 0] };

/** Поза, сдвинутая на положение этажа. */
function placed(pose: ViewPose, frame: ViewFrame): ViewPose {
  const shift = (p: Vec3): Vec3 => [p[0] + frame.offset[0], p[1] + frame.base, p[2] + frame.offset[1]];
  return { position: shift(pose.position), target: shift(pose.target) };
}

/** Подписи фиксированных видов. */
export const FIXED_VIEW_LABELS: Record<FixedView, string> = {
  iso: 'Изометрия',
  front: 'Со стороны передней стены',
  back: 'Со стороны задней стены',
  left: 'Слева',
  right: 'Справа',
};

/** Расстояние, с которого комната целиком помещается в кадр (FOV ≈ 50°). */
function framingDistance(dims: RoomDimensions): number {
  return Math.max(dims.width, dims.depth, dims.height) * 1.15 + 1.5;
}

/**
 * Поза камеры для фиксированного вида. Ближняя к камере стена скрывается
 * автоматически (эффект «кукольного домика»), поэтому интерьер виден целиком.
 */
export function fixedViewPose(view: FixedView, dims: RoomDimensions, frame: ViewFrame = GROUND_FRAME): ViewPose {
  const d = framingDistance(dims);
  const target: Vec3 = [0, dims.height * 0.35, 0];
  const y = dims.height * 1.25 + 1;
  switch (view) {
    case 'front': return placed({ position: [0, y, dims.depth / 2 + d * 0.8], target }, frame);
    case 'back': return placed({ position: [0, y, -dims.depth / 2 - d * 0.8], target }, frame);
    case 'left': return placed({ position: [-dims.width / 2 - d * 0.8, y, 0], target }, frame);
    case 'right': return placed({ position: [dims.width / 2 + d * 0.8, y, 0], target }, frame);
    default: return placed({ position: [d * 0.75, d * 0.8, d * 0.75], target }, frame);
  }
}

/** Облёт здания с улицы: центр, расстояние кадра и ограничения. */
export interface StreetView {
  pose: ViewPose;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
}

/**
 * Вид на здание целиком снаружи: камера спереди-справа, чуть выше крыши, смотрит в центр
 * здания; ближе определённого расстояния не подлететь — камера остаётся снаружи.
 * @param bounds - габариты здания на плане (по внешним граням стен)
 * @param height - высота здания до крыши
 */
export function streetView(bounds: Rect, height: number): StreetView {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const target: Vec3 = [(bounds.minX + bounds.maxX) / 2, height * 0.45, (bounds.minZ + bounds.maxZ) / 2];
  const distance = Math.max(width, depth, height) * 1.35 + 6;
  const dir = [0.55, 0.42, 0.72];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const position: Vec3 = [target[0] + (dir[0] / len) * distance, target[1] + (dir[1] / len) * distance, target[2] + (dir[2] / len) * distance];
  return {
    pose: { position, target },
    minDistance: Math.hypot(width, depth) / 2 + 1.5,
    maxDistance: distance * 3,
    maxPolarAngle: Math.PI / 2 - 0.06,
  };
}

/** Ограничения облёта (не уходить под пол и слишком далеко). */
export function orbitLimits(dims: RoomDimensions): { minDistance: number; maxDistance: number; maxPolarAngle: number } {
  return {
    minDistance: 0.8,
    maxDistance: framingDistance(dims) * 2.5,
    maxPolarAngle: Math.PI / 2 - 0.04,
  };
}

/**
 * Масштаб ортографической камеры плана сверху: комната с полями помещается в окно.
 * @param dims - размеры комнаты
 * @param viewport - размер области рендера, px
 */
export function topViewZoom(dims: RoomDimensions, viewport: { width: number; height: number }): number {
  const margin = 1.2;
  const zx = viewport.width / (dims.width + margin * 2);
  const zz = viewport.height / (dims.depth + margin * 2);
  return Math.max(10, Math.min(zx, zz));
}
