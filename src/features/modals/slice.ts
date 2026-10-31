/**
 * Redux Slice для управления модальными окнами.
 * @module modals/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ModalsState } from './types';

const initialState: ModalsState = {
  isCreateProjectModalOpen: false,
  isCreateFolderModalOpen: false,
  isCreateLayoutModalOpen: false,
  projectCreationError: null,
  folderCreationError: null,
  layoutCreationError: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'modals',
  initialState,
  reducers: {
    /** Открыть модалку создания проекта */
    openCreateProjectModal: (state) => {
      state.isCreateProjectModalOpen = true;
      state.projectCreationError = null;
    },
    /** Закрыть модалку создания проекта */
    closeCreateProjectModal: (state) => {
      state.isCreateProjectModalOpen = false;
    },
    /** Открыть модалку создания папки */
    openCreateFolderModal: (state) => {
      state.isCreateFolderModalOpen = true;
      state.folderCreationError = null;
    },
    /** Закрыть модалку создания папки */
    closeCreateFolderModal: (state) => {
      state.isCreateFolderModalOpen = false;
    },
    /** Открыть модалку создания макета */
    openCreateLayoutModal: (state) => {
      state.isCreateLayoutModalOpen = true;
      state.layoutCreationError = null;
    },
    /** Закрыть модалку создания макета */
    closeCreateLayoutModal: (state) => {
      state.isCreateLayoutModalOpen = false;
    },
    /** Установить ошибку создания проекта */
    setProjectCreationError: (state, action: PayloadAction<string | null>) => {
      state.projectCreationError = action.payload;
    },
    /** Установить ошибку создания папки */
    setFolderCreationError: (state, action: PayloadAction<string | null>) => {
      state.folderCreationError = action.payload;
    },
    /** Установить ошибку создания макета */
    setLayoutCreationError: (state, action: PayloadAction<string | null>) => {
      state.layoutCreationError = action.payload;
    },
  },
});