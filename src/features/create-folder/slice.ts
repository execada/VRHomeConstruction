/**
 * Redux Slice для создания папок.
 * Управляет формой и процессом создания.
 * @module create-folder/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CreateFolderState {
  folderName: string;
  isLoading: boolean;
  error: string | null;
}

const initialState: CreateFolderState = {
  folderName: '',
  isLoading: false,
  error: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'createFolder',
  initialState,
  reducers: {
    /** Установить название папки */
    setFolderName: (state, action: PayloadAction<string>) => {
      state.folderName = action.payload;
      state.error = null;
    },
    /** Установить флаг загрузки */
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Установить ошибку */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    /** Сбросить форму */
    resetForm: (state) => {
      state.folderName = '';
      state.isLoading = false;
      state.error = null;
    },
    /** Запрос на создание папки (сага) */
    createFolderRequested: () => {},
  },
});