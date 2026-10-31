/**
 * Положение и цвет солнца по времени суток.
 *
 * Модель упрощённая, но правдоподобная: солнце встаёт на востоке (+X),
 * в полдень находится над выбранной стороной дома (передняя +Z или задняя −Z)
 * и садится на западе (−X). Высота над горизонтом — синусоида от восхода до заката.
 * @module editor-3d/lib/sun
 */

import { kelvinToHex } from '@/shared/lib/color/colorTemperature';
import type { SunSide } from '@/features/environment/types';

/** Время восхода и заката, часы. */
export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 20;
/** Максимальная высота солнца в полдень, радианы (≈ 60°). */
export const MAX_ELEVATION = (60 * Math.PI) / 180;

/** Результат расчёта положения солнца. */
export interface SunState {
  /** Единичный вектор от центра сцены к солнцу [x, y, z] */
  direction: [number, number, number];
  /** Высота над горизонтом, радианы (отрицательная — ночь) */
  elevation: number;
  /** Доля дневного света 0..1 (плавно гаснет на закате) */
  daylight: number;
  /** Цвет солнечного света */
  color: string;
  /** Цветовая температура, К */
  kelvin: number;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Нормализовать время в диапазон [0, 24). */
export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** Подпись времени `ЧЧ:ММ`. */
export function formatHour(hour: number): string {
  const h = normalizeHour(hour);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 60 ? `${String((hh + 1) % 24).padStart(2, '0')}:00` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Положение солнца.
 * @param hour - время суток, часы (0–24)
 * @param side - сторона, над которой солнце проходит в полдень
 */
export function sunState(hour: number, side: SunSide): SunState {
  const h = normalizeHour(hour);
  const dayLength = SUNSET_HOUR - SUNRISE_HOUR;
  const progress = (h - SUNRISE_HOUR) / dayLength;
  const arc = Math.PI * Math.min(1, Math.max(0, progress));
  const isDay = progress >= 0 && progress <= 1;
  // Ночью солнце «под горизонтом»: отрицательная высота, чтобы свет плавно гас.
  const elevation = isDay ? MAX_ELEVATION * Math.sin(arc) : -0.2;
  const sideSign = side === 'front' ? 1 : -1;
  const horizontal: [number, number] = [Math.cos(arc), sideSign * Math.sin(arc)];
  const cosE = Math.cos(elevation);
  const direction: [number, number, number] = [horizontal[0] * cosE, Math.sin(elevation), horizontal[1] * cosE];
  const daylight = smoothstep(-0.03, 0.17, elevation);
  const kelvin = 2000 + (5800 - 2000) * smoothstep(0, 0.6, elevation);
  return { direction, elevation, daylight, color: kelvinToHex(kelvin), kelvin };
}

/** Цвет неба в режиме «цвет» в зависимости от дневного света (для фона без HDRI). */
export function skyTint(baseColor: string, daylight: number): { background: string; intensity: number } {
  return { background: baseColor, intensity: 0.15 + 0.85 * daylight };
}
