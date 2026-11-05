/**
 * Кварталы города под высоткой: сетка улиц, в каждом квартале одно–четыре здания разной
 * высоты, все ниже квартиры — над горизонтом остаётся настоящий силуэт города со снимка.
 * Вокруг башни свободная площадь. Раскладка детерминирована по зерну.
 * @module editor-3d/lib/cityLayout
 */

import { seededRandom } from '@/shared/lib/math/random';

/** Здание: центр основания, размеры, оттенок фасада 0..1, стеклянное или каменное. */
export interface CityBuilding {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  tone: number;
  glass: boolean;
}

export interface CityOptions {
  /** Радиус застройки, м */
  radius: number;
  /** Свободная площадь вокруг башни (от центра до ближайшего здания), м */
  clear: number;
  /** Высота пола квартиры над улицей, м: от неё считаются высоты зданий */
  elevation: number;
  seed?: number;
}

/** Шаг сетки: квартал и улица, м. */
export const CITY_BLOCK = 46;
const STREET = 14;
/** Самое высокое здание — доля высоты квартиры (крыши ниже взгляда из окна). */
const MAX_HEIGHT_SHARE = 0.72;
/** Доля стеклянных зданий. */
const GLASS_SHARE = 0.25;
const MIN_HEIGHT = 9;

/**
 * Раскладка зданий.
 * @param options - радиус, свободная площадь, высота квартиры, зерно
 */
export function cityLayout({ radius, clear, elevation, seed = 11 }: CityOptions): CityBuilding[] {
  const rand = seededRandom(seed);
  const lot = CITY_BLOCK - STREET;
  const cells = Math.ceil(radius / CITY_BLOCK);
  const buildings: CityBuilding[] = [];
  for (let i = -cells; i <= cells; i += 1) {
    for (let j = -cells; j <= cells; j += 1) {
      const cx = i * CITY_BLOCK;
      const cz = j * CITY_BLOCK;
      const distance = Math.hypot(cx, cz);
      if (distance + lot * Math.SQRT1_2 > radius || distance - lot * Math.SQRT1_2 < clear) continue;
      const split = rand() < 0.55 ? 2 : 1;
      const part = lot / split;
      for (let a = 0; a < split; a += 1) {
        for (let b = 0; b < split; b += 1) {
          const width = part * (0.68 + rand() * 0.27);
          const depth = part * (0.68 + rand() * 0.27);
          const height = MIN_HEIGHT + rand() ** 1.4 * Math.max(0, elevation * MAX_HEIGHT_SHARE - MIN_HEIGHT);
          buildings.push({
            x: cx - lot / 2 + part * (a + 0.5) + (rand() - 0.5) * (part - width),
            z: cz - lot / 2 + part * (b + 0.5) + (rand() - 0.5) * (part - depth),
            width,
            depth,
            height,
            tone: rand(),
            glass: rand() < GLASS_SHARE,
          });
        }
      }
    }
  }
  return buildings;
}
