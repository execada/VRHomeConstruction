/**
 * Публичный API сессии проекта (открытие, автосохранение, закрытие).
 * @module project-session
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const ProjectSessionFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { SaveState, SessionStatus } from './types';
