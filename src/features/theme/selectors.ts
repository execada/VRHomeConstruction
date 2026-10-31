/**
 * Селекторы темы.
 * @module theme/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, ThemeState } from './slice';

type State = {
  [name]: ThemeState;
};

const root = (state: State) => state[name];

/** Выбранный режим темы */
const selectThemeMode = createSelector(root, (state) => state?.mode ?? 'system');

export const selectors = {
  selectThemeMode,
};
