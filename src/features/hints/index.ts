/**
 * Публичный API подсказок и обучения редактора.
 * @module hints
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const HintsFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { HintsState } from './types';
export { HelpButton } from './ui/HelpButton';
export { HintLayer } from './ui/HintLayer';
export { TourOverlay } from './ui/TourOverlay';
