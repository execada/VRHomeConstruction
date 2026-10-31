/**
 * Позиции камеры: фиксированные виды, ограничения облёта, масштаб плана сверху.
 * @module camera/lib/views
 */

import type { RoomDimensions } from '@/features/editor-3d/types';
import type { FixedView } from '../types';

type Vec3 = [number, number, number];

/** Положение камеры и точка, на которую она смотрит. */
export interface ViewPose {
  position: Vec3;
  target: Vec3;
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
export function fixedViewPose(view: FixedView, dims: RoomDimensions): ViewPose {
  const d = framingDistance(dims);
  const target: Vec3 = [0, dims.height * 0.35, 0];
  const y = dims.height * 1.25 + 1;
  switch (view) {
    case 'front': return { position: [0, y, dims.depth / 2 + d * 0.8], target };
    case 'back': return { position: [0, y, -dims.depth / 2 - d * 0.8], target };
    case 'left': return { position: [-dims.width / 2 - d * 0.8, y, 0], target };
    case 'right': return { position: [dims.width / 2 + d * 0.8, y, 0], target };
    default: return { position: [d * 0.75, d * 0.8, d * 0.75], target };
  }
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
