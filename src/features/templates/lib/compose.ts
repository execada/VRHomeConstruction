/**
 * Помощники сборки шаблонов комнат: предмет у стены, проём, отделка.
 * Габариты берутся из справочника известных размеров, поэтому предметы
 * ставятся вплотную к стенам без зазоров и наложений.
 * @module templates/lib/compose
 */

import { KNOWN_MODEL_SIZES } from '@/features/furniture/lib/knownSizes';
import type { FurnitureItem } from '@/features/furniture/types';
import { withSill } from '@/features/editor-3d/lib/openings';
import type { Opening, RoomDimensions, SurfaceFinish, WallSide } from '@/features/editor-3d/types';

/** Отделка: текстура + тонирование. */
export const finish = (textureId: string | null, color = '#ffffff', scale = 1): SurfaceFinish => ({ textureId, color, scale });

/** Одинаковая отделка всех стен. */
export const allWalls = (f: SurfaceFinish): Record<WallSide, SurfaceFinish> => ({ front: f, back: f, left: f, right: f });

/** Поворот, при котором фасад предмета смотрит от стены в комнату. */
const FACING: Record<WallSide, number> = { back: 0, left: Math.PI / 2, front: Math.PI, right: -Math.PI / 2 };

interface ItemOptions {
  /** Поворот вокруг вертикали (по умолчанию 0) */
  angle?: number;
  /** Высота низа над полом */
  elevation?: number;
  name: string;
}

/** Предмет мебели в точке [x, z]. */
export function itemAt(id: string, path: string, center: [number, number], options: ItemOptions): FurnitureItem {
  const sizes = KNOWN_MODEL_SIZES[path];
  return {
    id,
    name: options.name,
    modelPath: path,
    position: [center[0], options.elevation ?? 0, center[1]],
    rotation: [0, options.angle ?? 0, 0],
    scale: 1,
    ...sizes,
  };
}

/**
 * Предмет вплотную к стене, фасадом в комнату.
 * @param id - идентификатор предмета в шаблоне
 * @param path - путь модели
 * @param dims - размеры комнаты
 * @param side - стена
 * @param offset - смещение вдоль стены от её середины (по мировой оси, параллельной стене)
 * @param options - название, высота над полом и зазор до стены (gap, м)
 */
export function againstWall(
  id: string,
  path: string,
  dims: RoomDimensions,
  side: WallSide,
  offset: number,
  options: Omit<ItemOptions, 'angle'> & { gap?: number },
): FurnitureItem {
  const { halfDepth } = KNOWN_MODEL_SIZES[path] ?? { halfDepth: 0.4 };
  const gap = options.gap ?? 0.02;
  const inset = halfDepth + gap;
  const center: [number, number] = {
    back: [offset, -dims.depth / 2 + inset],
    front: [offset, dims.depth / 2 - inset],
    left: [-dims.width / 2 + inset, offset],
    right: [dims.width / 2 - inset, offset],
  }[side] as [number, number];
  return itemAt(id, path, center, { ...options, angle: FACING[side] });
}

/** Окно на стене (u — центр вдоль стены, если смотреть изнутри). */
export function windowOn(id: string, wallId: string, u: number, width = 1.4, height = 1.5, sill = 0.8): Opening {
  return withSill({ id, wallId, type: 'window', position: [u, 0], width, height }, sill);
}

/** Дверь на стене. */
export function doorOn(id: string, wallId: string, u: number, width = 0.9, height = 2.1): Opening {
  return withSill({ id, wallId, type: 'door', position: [u, 0], width, height }, 0);
}
