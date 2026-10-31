/**
 * Селекторы для создания макетов.
 * @module create-layout/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, CreateLayoutState } from './slice';

type State = {
  [name]: CreateLayoutState;
};

const root = (state: State) => state[name];

/** Список макетов */
const selectLayouts = createSelector(root, (state) => state?.layouts ?? []);
/** Название нового макета */
const selectLayoutName = createSelector(root, (state) => state?.layoutName ?? '');
/** Флаг загрузки */
const selectIsLoading = createSelector(root, (state) => state?.isLoading ?? false);
/** Ошибка */
const selectError = createSelector(root, (state) => state?.error);

export const selectors = {
  selectLayouts,
  selectLayoutName,
  selectIsLoading,
  selectError,
};