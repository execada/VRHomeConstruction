/**
 * Значения окружения по умолчанию и допустимые диапазоны.
 * @module environment/constants
 */

import type { EnvironmentState, SkySettings, SunSettings } from './types';

/** Солнце по умолчанию: утро, светит со стороны передней стены. */
export const DEFAULT_SUN: SunSettings = {
  enabled: true,
  side: 'front',
  timeOfDay: 10.5,
  intensity: 2.6,
  shadows: true,
};

/** Небо по умолчанию: HDRI-пейзаж (если каталог не загрузился — процедурное небо). */
export const DEFAULT_SKY: SkySettings = {
  mode: 'hdri',
  hdriId: 'meadow_2',
  color: '#a9c8e8',
  rotation: 0,
  exposure: 1,
};

export const DEFAULT_ENVIRONMENT: EnvironmentState = {
  sun: DEFAULT_SUN,
  sky: DEFAULT_SKY,
};
