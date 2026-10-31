/**
 * Саги уведомлений: сохранение списка в localStorage.
 * @module notifications/saga
 */

import { select, takeLatest } from 'typed-redux-saga';
import { writeStored } from '@/shared/lib/storage';
import { actions, NOTIFICATIONS_STORAGE_KEY } from './slice';
import { selectors } from './selectors';

/** Записать уведомления. */
function* persistNotificationsSaga() {
  const items = yield* select(selectors.selectNotifications);
  writeStored(NOTIFICATIONS_STORAGE_KEY, items);
}

/** Корневая сага уведомлений */
export function* initSaga() {
  yield* takeLatest(
    [
      actions.pushNotification.type,
      actions.markAllRead.type,
      actions.dismissNotification.type,
      actions.clearNotifications.type,
    ],
    persistNotificationsSaga,
  );
}
