/**
 * Публичный API фичи выделения.
 * @module selection
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const SelectionFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { SceneSelection, SelectionState } from './types';
