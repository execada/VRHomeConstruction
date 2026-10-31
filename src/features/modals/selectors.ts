/**
 * Селекторы для модальных окон.
 * @module modals/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name } from './slice';
import { ModalsState } from './types';

type State = {
  [name]: ModalsState;
};

const root = (state: State) => state[name];

/** Открыта ли модалка создания проекта */
const selectIsCreateProjectModalOpen = createSelector(root, (state) => state?.isCreateProjectModalOpen ?? false);
/** Открыта ли модалка создания папки */
const selectIsCreateFolderModalOpen = createSelector(root, (state) => state?.isCreateFolderModalOpen ?? false);
/** Открыта ли модалка создания макета */
const selectIsCreateLayoutModalOpen = createSelector(root, (state) => state?.isCreateLayoutModalOpen ?? false);

/** Ошибка создания проекта */
const selectProjectCreationError = createSelector(root, (state) => state?.projectCreationError);
/** Ошибка создания папки */
const selectFolderCreationError = createSelector(root, (state) => state?.folderCreationError);
/** Ошибка создания макета */
const selectLayoutCreationError = createSelector(root, (state) => state?.layoutCreationError);

export const selectors = {
  selectIsCreateProjectModalOpen,
  selectIsCreateFolderModalOpen,
  selectIsCreateLayoutModalOpen,
  selectProjectCreationError,
  selectFolderCreationError,
  selectLayoutCreationError,
};