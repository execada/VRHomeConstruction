/**
 * Расстановка потолочных светильников и перевод настроек света в параметры three.js.
 * @module editor-3d/lib/lamps
 */

import { kelvinToHex } from '@/shared/lib/color/colorTemperature';
import type { LightConfig, RoomDimensions } from '../types';

/** Отступ светильника от потолка, м. */
export const LAMP_DROP = 0.12;
/** Сила света одного светильника (кд) при яркости 1. */
const CANDELA_PER_UNIT = 55;

/**
 * Позиции светильников сеткой ~ один на 9 м² (не больше maxLamps).
 * @returns точки [x, y, z] под потолком
 */
export function lampPositions(dims: RoomDimensions, maxLamps = 6): Array<[number, number, number]> {
  const cols = Math.max(1, Math.round(dims.width / 3));
  const rows = Math.max(1, Math.round(dims.depth / 3));
  const scale = Math.min(1, Math.sqrt(maxLamps / (cols * rows)));
  const c = Math.max(1, Math.floor(cols * scale));
  const r = Math.max(1, Math.floor(rows * scale));
  const y = dims.height - LAMP_DROP;
  return Array.from({ length: c * r }, (_, i) => {
    const ix = i % c;
    const iz = Math.floor(i / c);
    return [(-0.5 + (ix + 0.5) / c) * dims.width, y, (-0.5 + (iz + 0.5) / r) * dims.depth];
  });
}

/** Цвет света по настройкам (температура или произвольный цвет). */
export function lightColor(light: LightConfig): string {
  return light.colorMode === 'temperature' ? kelvinToHex(light.temperature) : light.color;
}

/**
 * Сила света каждого светильника: общая яркость делится между светильниками
 * не полностью (√n), чтобы большие комнаты были светлее маленьких, но не пересвечены.
 */
export function lampCandela(light: LightConfig, lampCount: number): number {
  if (!light.enabled || lampCount <= 0) return 0;
  return (light.intensity * CANDELA_PER_UNIT) / Math.sqrt(lampCount);
}
