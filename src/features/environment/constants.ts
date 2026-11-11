/**
 * Значения окружения по умолчанию и допустимые диапазоны.
 * @module environment/constants
 */

import type { EnvironmentState, ResidenceSettings, SkySettings, SunSettings } from './types';

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

/** Пределы этажей дома. */
export const RESIDENCE_LIMITS = { minStorey: 1, maxStoreys: 60 } as const;

/** Квартира в доме по умолчанию: выключено, пятый этаж девятиэтажки. */
export const DEFAULT_RESIDENCE: ResidenceSettings = { enabled: false, storey: 5, storeys: 9 };

export const DEFAULT_ENVIRONMENT: EnvironmentState = {
  sun: DEFAULT_SUN,
  sky: DEFAULT_SKY,
};
