/**
 * Redux Slice выделения: какой объект сцены редактируется в инспекторе.
 * Хранит только идентификаторы — актуальные данные объекта берутся из его слайса,
 * поэтому инспектор, 2D и 3D всегда показывают одно и то же.
 * @module selection/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SceneSelection, SelectionState } from './types';

const initialState: SelectionState = {
  current: null,
  hoveredId: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    /** Выделить объект (null — снять выделение) */
    select: (state, action: PayloadAction<SceneSelection | null>) => {
      state.current = action.payload;
    },
    /** Снять выделение */
    clearSelection: (state) => {
      state.current = null;
    },
    /** Объект под курсором */
    setHovered: (state, action: PayloadAction<string | null>) => {
      state.hoveredId = action.payload;
    },
  },
});

export type { SelectionState };
