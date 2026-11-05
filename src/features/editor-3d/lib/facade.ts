/**
 * Процедурные текстуры высоток с маской окон, горящих вечером: навесной стеклянный фасад
 * (стекло, импосты, межэтажные панели) и каменная стена с окнами — для кварталов города.
 * Пиксели строятся без canvas, поэтому одинаковы в браузере, VR и тестах.
 * @module editor-3d/lib/facade
 */

import { seededRandom } from '@/shared/lib/math/random';

/** Модуль фасада: панели шириной 1,5 м, этаж 3,6 м. */
export const FACADE_MODULE = { columns: 8, floors: 4, panelWidth: 1.5, floorHeight: 3.6 } as const;
/** Ширина и высота модуля фасада, м. */
export const FACADE_MODULE_METERS = {
  width: FACADE_MODULE.columns * FACADE_MODULE.panelWidth,
  height: FACADE_MODULE.floors * FACADE_MODULE.floorHeight,
} as const;

/** Навесной стеклянный фасад или каменная стена с окнами. */
export type FacadeStyle = 'curtain' | 'punched';
type Part = 'frame' | 'solid' | 'glass';

const COLORS: Record<FacadeStyle, Record<Part, readonly number[]>> = {
  curtain: { frame: [196, 201, 206], solid: [46, 52, 60], glass: [58, 72, 88] },
  punched: { frame: [214, 208, 198], solid: [214, 208, 198], glass: [70, 84, 100] },
};
const LIT = [255, 214, 160];
/** Доля этажа под непрозрачной межэтажной панелью (снизу) у стеклянного фасада. */
const SPANDREL_SHARE = 0.24;
/** Доля окон, в которых вечером горит свет. */
const LIT_SHARE = 0.3;

/** RGBA-пиксели фасада: цвет и маска горящих окон (строка 0 — низ, как у DataTexture). */
export interface FacadePixels {
  width: number;
  height: number;
  color: Uint8Array;
  lit: Uint8Array;
}

/** Что в точке панели (u — пиксели от левого края панели, v — доля высоты этажа). */
function facadePart(style: FacadeStyle, u: number, v: number, panelW: number, mullion: number): Part {
  if (style === 'punched') return u >= panelW * 0.2 && u < panelW * 0.8 && v >= 0.3 && v < 0.82 ? 'glass' : 'solid';
  if (u < mullion / 2 || u >= panelW - mullion / 2 || v < 0.012) return 'frame';
  return v < SPANDREL_SHARE ? 'solid' : 'glass';
}

/**
 * Пиксели модуля фасада.
 * @param width - ширина текстуры (кратна числу панелей)
 * @param height - высота текстуры (кратна числу этажей)
 * @param seed - зерно разброса оттенков и горящих окон
 * @param style - стеклянный фасад или стена с окнами
 */
export function facadePixels(width = 512, height = 512, seed = 7, style: FacadeStyle = 'curtain'): FacadePixels {
  const { columns, floors } = FACADE_MODULE;
  const panelW = width / columns;
  const floorH = height / floors;
  const mullion = Math.max(2, Math.round(panelW * 0.05));
  const rand = seededRandom(seed);
  const tint = Array.from({ length: columns * floors }, () => (rand() - 0.5) * 18);
  const lit = Array.from({ length: columns * floors }, () => rand() < LIT_SHARE);
  const palette = COLORS[style];
  const color = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const floor = Math.min(floors - 1, Math.floor(y / floorH));
    const v = (y - floor * floorH) / floorH;
    for (let x = 0; x < width; x += 1) {
      const column = Math.min(columns - 1, Math.floor(x / panelW));
      const panel = floor * columns + column;
      const part = facadePart(style, x - column * panelW, v, panelW, mullion);
      // Стекло чуть светлее к верху (отражение неба) и с разбросом оттенка по панелям.
      const lift = part === 'glass' ? 14 * v + tint[panel] : 0;
      const i = (y * width + x) * 4;
      color[i] = clampByte(palette[part][0] + lift);
      color[i + 1] = clampByte(palette[part][1] + lift);
      color[i + 2] = clampByte(palette[part][2] + lift);
      color[i + 3] = 255;
      const glow = part === 'glass' && lit[panel];
      mask[i] = glow ? LIT[0] : 0;
      mask[i + 1] = glow ? LIT[1] : 0;
      mask[i + 2] = glow ? LIT[2] : 0;
      mask[i + 3] = 255;
    }
  }
  return { width, height, color, lit: mask };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
