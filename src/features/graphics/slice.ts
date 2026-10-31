/**
 * Redux Slice настроек графики: пресеты, тени, размер карты теней,
 * разрешение рендера, сглаживание, счётчик FPS.
 * Начальное состояние восстанавливается из localStorage.
 * @module graphics/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { readStored } from '@/shared/lib/storage';
import { applyPreset, DEFAULT_GRAPHICS, RESOLUTION_SCALE_RANGE, withOverride } from './lib/presets';
import { GraphicsPreset, GraphicsSettings } from './types';

/** Ключ хранения настроек графики. */
export const GRAPHICS_STORAGE_KEY = 'graphics';

const storedSchema = z.object({
  preset: z.enum(['low', 'medium', 'high', 'custom']),
  shadows: z.boolean(),
  shadowMapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]),
  resolutionScale: z.number().min(RESOLUTION_SCALE_RANGE[0]).max(RESOLUTION_SCALE_RANGE[1]),
  antialias: z.boolean(),
  showFps: z.boolean(),
});

const initialState: GraphicsSettings = readStored(GRAPHICS_STORAGE_KEY, storedSchema, DEFAULT_GRAPHICS);

export const { actions, name, reducer } = createSlice({
  name: 'graphics',
  initialState,
  reducers: {
    /** Применить пресет качества */
    setPreset: (state, action: PayloadAction<Exclude<GraphicsPreset, 'custom'>>) =>
      applyPreset(state, action.payload),
    /** Изменить отдельные параметры (пресет станет «Своя», если значения не совпадут) */
    updateGraphics: (state, action: PayloadAction<Partial<Omit<GraphicsSettings, 'preset'>>>) =>
      withOverride(state, action.payload),
  },
});

export type { GraphicsSettings };
