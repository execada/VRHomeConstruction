/**
 * Redux Slice для управления папками.
 * @module folders/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Folder } from './types';

export interface FoldersState {
  folders: Folder[];
  isLoading: boolean;
  error: string | null;
  activeMenuId: string | null;
  activeFolderId: string | null;
}

const initialState: FoldersState = {
  folders: [],
  isLoading: false,
  error: null,
  activeMenuId: null,
  activeFolderId: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'folders',
  initialState,
  reducers: {
    /** Сбросить состояние (смена пользователя) */
    resetFolders: () => initialState,

    /** Заменить список папок данными сервера (откат оптимистичных изменений после ошибки) */
    replaceFolders: (state, action: PayloadAction<Folder[]>) => {
      state.folders = action.payload;
    },

    /** Добавить новую папку */
    addFolder: (state, action: PayloadAction<Folder>) => {
      const existing = state.folders.find(f => f.id === action.payload.id);
      if (!existing) {
        state.folders.push(action.payload);
      }
    },
    /** Переименовать папку */
    renameFolder: (state, action: PayloadAction<{ folderId: string; name: string }>) => {
      state.folders = state.folders.map(f => (f.id === action.payload.folderId ? { ...f, name: action.payload.name } : f));
    },
    /** Удалить папку */
    removeFolder: (state, action: PayloadAction<string>) => {
      state.folders = state.folders.filter(f => f.id !== action.payload);
    },
    /** Добавить проект в папку */
    addProjectToFolder: (state, action: PayloadAction<{ folderId: string; projectId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.folderId);
      if (folder && !folder.projectIds.includes(action.payload.projectId)) {
        folder.projectIds.push(action.payload.projectId);
      }
    },
    /** Добавить макет в папку */
    addLayoutToFolder: (state, action: PayloadAction<{ folderId: string; layoutId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.folderId);
      if (folder && !folder.layoutIds.includes(action.payload.layoutId)) {
        folder.layoutIds.push(action.payload.layoutId);
      }
    },
    /** Добавить папку в папку */
    addFolderToFolder: (state, action: PayloadAction<{ parentFolderId: string; childFolderId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.parentFolderId);
      if (folder && !folder.childFolderIds.includes(action.payload.childFolderId)) {
        folder.childFolderIds.push(action.payload.childFolderId);
      }
    },
    /** Удалить проект из папки */
    removeProjectFromFolder: (state, action: PayloadAction<{ folderId: string; projectId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.folderId);
      if (folder) {
        folder.projectIds = folder.projectIds.filter(id => id !== action.payload.projectId);
      }
    },
    /** Удалить макет из папки */
    removeLayoutFromFolder: (state, action: PayloadAction<{ folderId: string; layoutId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.folderId);
      if (folder) {
        folder.layoutIds = folder.layoutIds.filter(id => id !== action.payload.layoutId);
      }
    },
    /** Удалить папку из папки */
    removeFolderFromFolder: (state, action: PayloadAction<{ parentFolderId: string; childFolderId: string }>) => {
      const folder = state.folders.find(f => f.id === action.payload.parentFolderId);
      if (folder) {
        folder.childFolderIds = folder.childFolderIds.filter(id => id !== action.payload.childFolderId);
      }
    },
    /** Установить флаг загрузки */
    setFoldersLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Установить ошибку */
    setFoldersError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    /** Установить активное меню */
    setActiveMenuId: (state, action: PayloadAction<string | null>) => {
      state.activeMenuId = action.payload;
    },
    /** Установить активную папку */
    setActiveFolderId: (state, action: PayloadAction<string | null>) => {
      state.activeFolderId = action.payload;
    },
  },
});