/**
 * Публичный API фичи камеры.
 * @module camera
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const CameraFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { CameraMode, FixedView, CameraState } from './types';
