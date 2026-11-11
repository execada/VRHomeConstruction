/**
 * Redux Slice окружения: солнце (время суток, сторона, интенсивность, тени) и небо.
 * Сохраняется вместе с проектом (часть документа сцены).
 * @module environment/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_ENVIRONMENT, DEFAULT_RESIDENCE, RESIDENCE_LIMITS } from './constants';
import { EnvironmentState, ResidenceSettings, SkySettings, SunSettings } from './types';

/**
 * Этаж и этажность в допустимых пределах: целые, этажей в доме 1–60, этаж квартиры не выше
 * последнего. Если подняли этаж выше этажности — дом становится выше.
 */
export function clampResidence(next: ResidenceSettings): ResidenceSettings {
  const whole = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
  const { minStorey, maxStoreys } = RESIDENCE_LIMITS;
  const storey = Math.min(maxStoreys, Math.max(minStorey, whole(next.storey, DEFAULT_RESIDENCE.storey)));
  const storeys = Math.min(maxStoreys, Math.max(storey, whole(next.storeys, DEFAULT_RESIDENCE.storeys)));
  return { enabled: Boolean(next.enabled), storey, storeys };
}

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
    /** Квартира в доме (частично): этаж, этажность, включено ли */
    setResidence: (state, action: PayloadAction<Partial<ResidenceSettings>>) => {
      state.residence = clampResidence({ ...(state.residence ?? DEFAULT_RESIDENCE), ...action.payload });
    },
    /** Загрузить окружение из проекта */
    loadEnvironment: (_state, action: PayloadAction<EnvironmentState>) => action.payload,
    /** Сбросить окружение (выход из редактора) */
    resetEnvironment: () => initialState,
  },
});

export type { EnvironmentState };
