/**
 * Redux Slice истории изменений сцены (отмена/повтор).
 * Снимки записывает сага (см. history/saga), редьюсеры только управляют стеками.
 * @module history/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import { pushLimited } from './lib/coalesce';
import { HistoryState } from './types';

const initialState: HistoryState = {
  past: [],
  future: [],
};

export const { actions, name, reducer } = createSlice({
  name: 'history',
  initialState,
  reducers: {
    /** Записать снимок «до изменения»; повтор становится недоступен */
    record: (state, action: PayloadAction<SceneDocument>) => ({
      past: pushLimited(state.past, action.payload),
      future: [],
    }),
    /** Шаг назад: последний снимок уходит из past, текущая сцена — в future */
    stepBack: (state, action: PayloadAction<SceneDocument>) => ({
      past: state.past.slice(0, -1),
      future: pushLimited(state.future, action.payload),
    }),
    /** Шаг вперёд: последний снимок уходит из future, текущая сцена — в past */
    stepForward: (state, action: PayloadAction<SceneDocument>) => ({
      past: pushLimited(state.past, action.payload),
      future: state.future.slice(0, -1),
    }),
    /** Очистить историю (загрузка другого проекта) */
    clearHistory: () => initialState,
    /** Запрос отмены (сага) */
    undoRequested: () => {},
    /** Запрос повтора (сага) */
    redoRequested: () => {},
  },
});

export type { HistoryState };
