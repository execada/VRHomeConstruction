/**
 * Публичный API фичи уведомлений.
 * @module notifications
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const NotificationsFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { AppNotification, NotificationKind } from './types';
