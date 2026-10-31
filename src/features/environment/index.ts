/**
 * Публичный API фичи окружения (солнце, небо, HDRI).
 * @module environment
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';

export const EnvironmentFeature = {
  reducer: { [name]: reducer },
  actions,
  selectors,
};

export type { EnvironmentState, SunSettings, SkySettings, SkyMode, SunSide } from './types';
