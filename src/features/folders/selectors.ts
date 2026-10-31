/**
 * Селекторы для папок.
 * @module folders/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name } from './slice';
import { FoldersState } from './types';

type State = {
  [name]: FoldersState;
};

const root = (state: State) => state[name];

/** Все папки */
const selectFolders = createSelector(root, (folders) => folders?.folders ?? []);
/** Папка по id */
const selectFolderById = createSelector(
  [root, (_, id: string) => id],
  (folders, id) => folders?.folders.find(f => f.id === id)
);
/** Флаг загрузки */
const selectFoldersLoading = createSelector(root, (folders) => folders?.isLoading ?? false);
/** Ошибка */
const selectFoldersError = createSelector(root, (folders) => folders?.error);
/** Активное меню */
const selectActiveMenuId = createSelector(root, (folders) => folders?.activeMenuId ?? null);
/** Активная папка */
const selectActiveFolderId = createSelector(root, (folders) => folders?.activeFolderId ?? null);

export const selectors = {
  selectFolders,
  selectFolderById,
  selectFoldersLoading,
  selectFoldersError,
  selectActiveMenuId,
  selectActiveFolderId,
};