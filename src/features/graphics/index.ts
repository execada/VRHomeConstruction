/**
 * Публичный API фичи настроек графики.
 * @module graphics
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const GraphicsFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { GraphicsSettings, GraphicsPreset, ShadowMapSize } from './types';
