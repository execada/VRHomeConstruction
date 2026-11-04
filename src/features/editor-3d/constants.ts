/**
 * Константы редактора 3D-сцены: размеры комнаты, толщина стен, свет и отделка по умолчанию.
 * @module editor-3d/constants
 */

import { DEFAULT_OUTER_MATERIAL } from './lib/wallMaterials';
import { RoomColors, LightConfig, OuterWalls, RoomFinishes, SurfaceFinish } from './types';

/** Размеры комнаты по умолчанию */
export const DEFAULT_ROOM_WIDTH = 4;
export const DEFAULT_ROOM_HEIGHT = 3;
export const DEFAULT_ROOM_DEPTH = 4;
/** Интенсивность света комнаты по умолчанию */
const DEFAULT_LIGHT_INTENSITY = 1.2;
/** Интенсивность рассеянного света по умолчанию */
const DEFAULT_AMBIENT_INTENSITY = 0.4;
/** Цвета по умолчанию */
export const DEFAULT_COLORS: RoomColors = {
  walls: '#c0b0a0',
  floor: '#e8e0d0',
  ceiling: '#ffffff',
};
/** Параметры освещения по умолчанию: тёплый свет 3500 K с тенями */
export const DEFAULT_LIGHT: LightConfig = {
  intensity: DEFAULT_LIGHT_INTENSITY,
  ambientIntensity: DEFAULT_AMBIENT_INTENSITY,
  color: '#ffffff',
  enabled: true,
  temperature: 3500,
  colorMode: 'temperature',
  shadows: true,
};
/** Диапазоны настроек света комнаты */
export const LIGHT_LIMITS = {
  intensity: [0, 5],
  ambientIntensity: [0, 2],
  temperature: [1800, 8000],
} as const;
/** Толщина внешних стен по умолчанию и допустимый диапазон, м */
export const DEFAULT_WALL_THICKNESS = 0.2;
export const WALL_THICKNESS_LIMITS = [0.05, 0.6] as const;
/** Внешние стены одинаковой толщины и материала. */
export function uniformOuterWalls(thickness: number = DEFAULT_WALL_THICKNESS, material = DEFAULT_OUTER_MATERIAL): OuterWalls {
  const spec = { thickness, material };
  return { front: spec, back: spec, left: spec, right: spec };
}
/** Внешние стены новой комнаты: кирпич 20 см */
export const DEFAULT_OUTER_WALLS: OuterWalls = uniformOuterWalls();
/** Однотонная отделка */
const plain = (color: string): SurfaceFinish => ({ textureId: null, color, scale: 1 });
/** Отделка новой комнаты: деревянный пол, светлые стены, белый потолок */
export const DEFAULT_FINISHES: RoomFinishes = {
  floor: { textureId: 'floor-wood', color: '#ffffff', scale: 1 },
  ceiling: plain('#fbfaf7'),
  walls: {
    front: plain('#ece6dc'),
    back: plain('#ece6dc'),
    left: plain('#ece6dc'),
    right: plain('#ece6dc'),
  },
};