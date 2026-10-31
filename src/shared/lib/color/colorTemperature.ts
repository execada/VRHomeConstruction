/**
 * Цветовые утилиты: цветовая температура (K) → RGB, смешивание и проверка HEX.
 * Используются светом комнаты, солнцем и превью оттенков.
 * @module shared/lib/color/colorTemperature
 */

/** Допустимый диапазон цветовой температуры, К. */
export const MIN_KELVIN = 1000;
export const MAX_KELVIN = 40000;

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Строка вида `#rrggbb`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value)));

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => channel(v).toString(16).padStart(2, '0')).join('')}`;

/** Разобрать `#rrggbb` в компоненты 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  if (!isHexColor(hex)) return [255, 255, 255];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Цвет абсолютно чёрного тела для температуры (аппроксимация Таннера Хелланда).
 * @param kelvin - температура, К (ограничивается диапазоном 1000–40000)
 * @returns HEX-цвет `#rrggbb`
 */
export function kelvinToHex(kelvin: number): string {
  const temp = Math.min(MAX_KELVIN, Math.max(MIN_KELVIN, kelvin)) / 100;

  const red = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  const green =
    temp <= 66
      ? 99.4708025861 * Math.log(temp) - 161.1195681661
      : 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  let blue: number;
  if (temp >= 66) blue = 255;
  else if (temp <= 19) blue = 0;
  else blue = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;

  return toHex(red, green, blue);
}

/**
 * Линейно смешать два HEX-цвета.
 * @param a - цвет при t = 0
 * @param b - цвет при t = 1
 * @param t - коэффициент 0..1
 */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return toHex(ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k);
}

/** Перемножить цвета (тонирование текстуры цветом). */
export function multiplyHex(a: string, b: string): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return toHex((ca[0] * cb[0]) / 255, (ca[1] * cb[1]) / 255, (ca[2] * cb[2]) / 255);
}
