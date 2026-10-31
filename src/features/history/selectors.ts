/**
 * Селекторы истории изменений.
 * @module history/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, HistoryState } from './slice';

type State = {
  [name]: HistoryState;
};

const root = (state: State) => state[name];

const EMPTY: HistoryState['past'] = [];

/** Снимки для отмены */
const selectPast = createSelector(root, (state) => state?.past ?? EMPTY);
/** Снимки для повтора */
const selectFuture = createSelector(root, (state) => state?.future ?? EMPTY);
/** Можно ли отменить */
const selectCanUndo = createSelector(selectPast, (past) => past.length > 0);
/** Можно ли повторить */
const selectCanRedo = createSelector(selectFuture, (future) => future.length > 0);

export const selectors = {
  selectPast,
  selectFuture,
  selectCanUndo,
  selectCanRedo,
};
