/**
 * Селекторы сессии проекта.
 * @module project-session/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, ProjectSessionState } from './slice';

type State = {
  [name]: ProjectSessionState;
};

const root = (state: State) => state[name];

/** id открытого проекта */
const selectSessionProjectId = createSelector(root, (s) => s?.projectId ?? null);
/** Статус загрузки */
const selectSessionStatus = createSelector(root, (s) => s?.status ?? 'idle');
/** Ошибка загрузки */
const selectSessionError = createSelector(root, (s) => s?.error ?? null);
/** Статус сохранения */
const selectSaveState = createSelector(root, (s) => s?.saveState ?? 'saved');
/** Время последнего сохранения */
const selectLastSavedAt = createSelector(root, (s) => s?.lastSavedAt ?? null);

export const selectors = {
  selectSessionProjectId,
  selectSessionStatus,
  selectSessionError,
  selectSaveState,
  selectLastSavedAt,
};
