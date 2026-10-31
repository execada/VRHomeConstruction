/**
 * Redux Slice окружения: солнце (время суток, сторона, интенсивность, тени) и небо.
 * Сохраняется вместе с проектом (часть документа сцены).
 * @module environment/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_ENVIRONMENT } from './constants';
import { EnvironmentState, SkySettings, SunSettings } from './types';

const initialState: EnvironmentState = DEFAULT_ENVIRONMENT;

export const { actions, name, reducer } = createSlice({
  name: 'environment',
  initialState,
  reducers: {
    /** Изменить настройки солнца (частично) */
    setSun: (state, action: PayloadAction<Partial<SunSettings>>) => {
      state.sun = { ...state.sun, ...action.payload };
    },
    /** Изменить настройки неба (частично) */
    setSky: (state, action: PayloadAction<Partial<SkySettings>>) => {
      state.sky = { ...state.sky, ...action.payload };
    },
    /** Загрузить окружение из проекта */
    loadEnvironment: (_state, action: PayloadAction<EnvironmentState>) => action.payload,
    /** Сбросить окружение (выход из редактора) */
    resetEnvironment: () => initialState,
  },
});

export type { EnvironmentState };
