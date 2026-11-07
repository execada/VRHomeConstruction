/**
 * Redux Slice подсказок и обучения: включены ли подсказки, какие закрыты, шаг обучения.
 * Настройки (включены, закрытые, обучение пройдено) запоминаются в браузере (см. saga).
 * @module hints/slice
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { readStored } from '@/shared/lib/storage';
import type { HintsState } from './types';

/** Ключ хранения настроек подсказок. */
export const HINTS_STORAGE_KEY = 'hints';

/** Сохраняемая часть состояния. */
export const storedHintsSchema = z.object({
  enabled: z.boolean(),
  dismissed: z.array(z.string().max(40)).max(50),
  tourDone: z.boolean(),
});

const DEFAULTS = { enabled: true, dismissed: [], tourDone: false };

const initialState: HintsState = { ...readStored(HINTS_STORAGE_KEY, storedHintsSchema, DEFAULTS), tourStep: null };

export const { actions, name, reducer } = createSlice({
  name: 'hints',
  initialState,
  reducers: {
    /** Включить или выключить подсказки */
    setEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
    /** Закрыть подсказку («Понятно») */
    dismiss: (state, action: PayloadAction<string>) => {
      if (!state.dismissed.includes(action.payload)) state.dismissed.push(action.payload);
    },
    /** Показать все подсказки заново */
    resetHints: (state) => {
      state.enabled = true;
      state.dismissed = [];
    },
    /** Начать обучение с первого шага */
    startTour: (state) => {
      state.tourStep = 0;
    },
    /** Перейти к шагу обучения */
    setTourStep: (state, action: PayloadAction<number>) => {
      state.tourStep = Math.max(0, Math.floor(action.payload));
    },
    /** Закончить или закрыть обучение */
    finishTour: (state) => {
      state.tourStep = null;
      state.tourDone = true;
    },
  },
});

export type { HintsState };
