/**
 * Redux Slice каталога ассетов (HDRI, PBR-текстуры, модели из манифеста).
 * @module assets/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EMPTY_MANIFEST, type AssetManifest } from './lib/manifest';

/** Состояние загрузки каталога ассетов. */
export interface AssetsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  manifest: AssetManifest;
  error: string | null;
}

const initialState: AssetsState = {
  status: 'idle',
  manifest: EMPTY_MANIFEST,
  error: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    /** Запрос загрузки манифеста (сага) */
    loadManifestRequested: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    /** Манифест загружен */
    manifestLoaded: (state, action: PayloadAction<AssetManifest>) => {
      state.status = 'ready';
      state.manifest = action.payload;
    },
    /** Ошибка загрузки (каталог работает со встроенными ассетами) */
    manifestFailed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
  },
});
