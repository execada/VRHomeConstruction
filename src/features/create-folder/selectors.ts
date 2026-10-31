/**
 * Селекторы для создания папок.
 * @module create-folder/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, CreateFolderState } from './slice';

type State = {
  [name]: CreateFolderState;
};

const root = (state: State) => state[name];

/** Название новой папки */
const selectFolderName = createSelector(root, (state) => state?.folderName ?? '');
/** Флаг загрузки */
const selectIsLoading = createSelector(root, (state) => state?.isLoading ?? false);
/** Ошибка */
const selectError = createSelector(root, (state) => state?.error);

export const selectors = {
  selectFolderName,
  selectIsLoading,
  selectError,
};