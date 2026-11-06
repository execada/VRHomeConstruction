/**
 * Redux Slice камеры: режим (облёт, от первого лица, план, фикс-вид, улица),
 * выбранный фиксированный вид и столкновения.
 * Начальное состояние восстанавливается из localStorage.
 * @module camera/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { readStored } from '@/shared/lib/storage';
import { CAMERA_MODES, CameraMode, CameraState, FixedView } from './types';

/** Ключ хранения настроек камеры. */
export const CAMERA_STORAGE_KEY = 'camera';

const storedSchema = z.object({
  mode: z.enum(CAMERA_MODES),
  fixedView: z.enum(['iso', 'front', 'back', 'left', 'right']),
  collisions: z.boolean(),
});

const defaults: CameraState = { mode: 'orbit', fixedView: 'iso', collisions: true, viewRequest: 0 };

const initialState: CameraState = {
  ...defaults,
  ...readStored(CAMERA_STORAGE_KEY, storedSchema, defaults),
  viewRequest: 0,
};

export const { actions, name, reducer } = createSlice({
  name: 'camera',
  initialState,
  reducers: {
    /** Режим камеры */
    setMode: (state, action: PayloadAction<CameraMode>) => {
      state.mode = action.payload;
      state.viewRequest += 1;
    },
    /** Перейти к фиксированному виду */
    setFixedView: (state, action: PayloadAction<FixedView>) => {
      state.mode = 'fixed';
      state.fixedView = action.payload;
      state.viewRequest += 1;
    },
    /** Столкновения в режиме от первого лица */
    setCollisions: (state, action: PayloadAction<boolean>) => {
      state.collisions = action.payload;
    },
    /** Вернуть камеру к виду по умолчанию для текущего режима */
    resetView: (state) => {
      state.viewRequest += 1;
    },
  },
});

export type { CameraState };
