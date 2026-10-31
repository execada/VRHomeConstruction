/**
 * Redux Slice темы оформления (светлая / тёмная / как в системе).
 * @module theme/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { readStored } from '@/shared/lib/storage';
import { ThemeMode, ThemeState } from './types';

/** Ключ хранения темы. */
export const THEME_STORAGE_KEY = 'theme';

const initialState: ThemeState = {
  mode: readStored(THEME_STORAGE_KEY, z.enum(['light', 'dark', 'system']), 'system'),
};

export const { actions, name, reducer } = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /** Выбрать тему */
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
    },
  },
});

export type { ThemeState };
