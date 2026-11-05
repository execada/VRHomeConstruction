/**
 * Участок вокруг квартиры для вида наружу. Фотопанорама даёт небо и дальний горизонт,
 * а всё близкое — настоящая 3D-геометрия, поэтому снимок нигде не растягивается:
 * загородные панорамы — газон, перекрашенный в цвет травы со снимка и вдали переходящий
 * в саму фотографию; городские — терраса на крыше высотки, стеклянный фасад башни
 * и процедурный город внизу, уходящий в дымку цвета горизонта.
 * @module editor-3d/lib/site
 */

import { Color, SRGBColorSpace } from 'three';
import type { PanoramaSite } from '@/features/assets/lib/manifest';
import type { Rect } from '@/shared/lib/math/geometry2d';

export type SiteKind = PanoramaSite['kind'];
export type SiteSurfaceId = 'lawn' | 'terrace';

/** Покрытие участка: PBR-карты (CC0, Poly Haven) и размер плитки текстуры. */
export interface SiteSurface {
  maps: { color: string; normal: string; roughness: string };
  tileMeters: number;
}

export const SITE_SURFACES: Readonly<Record<SiteSurfaceId, SiteSurface>> = {
  lawn: {
    maps: { color: '/assets/site/lawn/color.jpg', normal: '/assets/site/lawn/normal.jpg', roughness: '/assets/site/lawn/roughness.jpg' },
    tileMeters: 2,
  },
  terrace: {
    maps: { color: '/assets/site/terrace/color.jpg', normal: '/assets/site/terrace/normal.jpg', roughness: '/assets/site/terrace/roughness.jpg' },
    tileMeters: 3,
  },
};

/** Участок, готовый к отрисовке. */
export interface SiteSpec {
  kind: SiteKind;
  surface: SiteSurfaceId;
  /** Высота пола квартиры над землёй, м (0 — дом на земле) */
  elevation: number;
}

/** Высота пола квартиры в высотке по умолчанию, м (около 30 этажей). */
export const DEFAULT_ELEVATION = 90;
/** Радиус земли без снимка (и улиц города): почти до горизонта, внутри дальней плоскости камеры 4 км. */
export const SITE_RADIUS = 3400;
/** Газон под фотопанорамой: вблизи 3D, на этих расстояниях от центра переходит в землю на снимке, м. */
export const LAWN_PHOTO_FADE: readonly [number, number] = [55, 170];
/** Радиус газона под фотопанорамой (дальше — только снимок), м. */
export const LAWN_PHOTO_RADIUS = 190;
/** Город под высоткой: радиус застройки и свободная площадь вокруг башни, м. */
export const CITY_RADIUS = 1300;
export const CITY_CLEAR = 70;
/** Газон отражает примерно столько света, сколько трава на снимке при дневном освещении. */
export const LAWN_ALBEDO = 0.62;
/** Доля оттенка со снимка в цвете газона (остальное — собственный цвет текстуры). */
export const LAWN_TINT_MIX = 0.8;

/**
 * Участок для панорамы (без описания — дом на газоне).
 * @param site - участок из манифеста панорамы
 */
export function resolveSite(site?: PanoramaSite): SiteSpec {
  if (site?.kind === 'elevated') return { kind: 'elevated', surface: 'terrace', elevation: site.elevation ?? DEFAULT_ELEVATION };
  return { kind: 'ground', surface: 'lawn', elevation: 0 };
}

/**
 * Дальность тумана: вблизи квартиры дымки нет, у края земли она полностью сливается с горизонтом.
 * @param kind - тип участка
 */
export function fogRange(kind: SiteKind): { near: number; far: number } {
  return kind === 'elevated' ? { near: 60, far: CITY_RADIUS - 150 } : { near: 150, far: SITE_RADIUS - 100 };
}

/**
 * Терраса на крыше высотки — ровно участок, по которому можно ходить вокруг квартиры.
 * @param lot - прямоугольник участка (см. lotRect)
 */
export function terraceBox(lot: Rect): { width: number; depth: number; center: [number, number] } {
  return {
    width: lot.maxX - lot.minX,
    depth: lot.maxZ - lot.minZ,
    center: [(lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2],
  };
}

/** Цвет в sRGB, 0..255. */
export type Rgb = readonly [number, number, number];

const NEUTRAL: Rgb = [150, 160, 170];

/**
 * Средний цвет полосы equirect-панорамы по высоте.
 * @param pixels - RGBA построчно сверху вниз (как ImageData.data)
 * @param width - ширина изображения
 * @param height - высота изображения (строка height/2 — горизонт)
 * @param fromDeg - верх полосы в градусах ниже горизонта (отрицательные — выше)
 * @param toDeg - низ полосы в градусах ниже горизонта
 */
export function bandColor(pixels: ArrayLike<number>, width: number, height: number, fromDeg: number, toDeg: number): Rgb {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return NEUTRAL;
  const row = (deg: number) => Math.min(height - 1, Math.max(0, Math.round(height / 2 + (deg / 180) * height)));
  const top = row(Math.min(fromDeg, toDeg));
  const bottom = row(Math.max(fromDeg, toDeg));
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
      count += 1;
    }
  }
  return [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)];
}

/** Цвета панорамы: у самого горизонта (дымка) и земли под ним (трава для газона). */
export interface HorizonColors {
  horizon: Rgb;
  ground: Rgb;
}

/**
 * Цвета из уменьшенной копии панорамы.
 * @param pixels - RGBA построчно сверху вниз
 * @param width - ширина
 * @param height - высота
 */
export function horizonColors(pixels: ArrayLike<number>, width: number, height: number): HorizonColors {
  return { horizon: bandColor(pixels, width, height, -1, 2), ground: bandColor(pixels, width, height, 4, 16) };
}

/** Цвета по умолчанию, пока панорама не разобрана (или без canvas). */
export const DEFAULT_HORIZON: HorizonColors = { horizon: NEUTRAL, ground: NEUTRAL };

/**
 * Цвет, приглушённый так же, как фон: множитель применяется в линейном пространстве,
 * как у материала фона, поэтому дымка ночью гаснет вместе со снимком.
 * @param rgb - цвет в sRGB 0..255
 * @param intensity - яркость фона (1 — днём)
 */
export function dimmedColor(rgb: Rgb, intensity: number): Color {
  return new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace).multiplyScalar(Math.max(0, intensity));
}

/**
 * Альбедо газона под цвет травы на снимке (линейное пространство).
 * @param ground - цвет земли на снимке, sRGB 0..255
 */
export function lawnTint(ground: Rgb): Color {
  return dimmedColor(ground, LAWN_ALBEDO);
}
