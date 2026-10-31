/**
 * Селекторы уведомлений.
 * @module notifications/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, NotificationsState } from './slice';

type State = {
  [name]: NotificationsState;
};

const root = (state: State) => state[name];

const EMPTY: NotificationsState['items'] = [];

/** Все уведомления */
const selectNotifications = createSelector(root, (state) => state?.items ?? EMPTY);
/** Число непрочитанных */
const selectUnreadCount = createSelector(selectNotifications, (items) => items.filter((n) => !n.read).length);

export const selectors = {
  selectNotifications,
  selectUnreadCount,
};
