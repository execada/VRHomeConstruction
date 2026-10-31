/**
 * Redux Slice для создания макетов.
 * @module create-layout/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Layout } from './types';

export interface CreateLayoutState {
  layoutName: string;
  isLoading: boolean;
  error: string | null;
  layouts: Layout[];
}

const initialState: CreateLayoutState = {
  layoutName: '',
  isLoading: false,
  error: null,
  layouts: [],
};

export const { actions, name, reducer } = createSlice({
  name: 'createLayout',
  initialState,
  reducers: {
    /** Установить название макета */
    setLayoutName: (state, action: PayloadAction<string>) => {
      state.layoutName = action.payload;
      state.error = null;
    },
    /** Установить флаг загрузки */
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Установить ошибку */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    /** Сбросить форму */
    resetForm: (state) => {
      state.layoutName = '';
      state.isLoading = false;
      state.error = null;
    },
    /** Добавить макет в список */
    addLayout: (state, action: PayloadAction<Layout>) => {
      state.layouts.push(action.payload);
    },
    /** Удалить макет */
    removeLayout: (state, action: PayloadAction<string>) => {
      state.layouts = state.layouts.filter(l => l.id !== action.payload);
    },
    /** Добавить или обновить макет (сохранение текущей комнаты как шаблона) */
    upsertLayout: (state, action: PayloadAction<Layout>) => {
      const exists = state.layouts.some(l => l.id === action.payload.id);
      state.layouts = exists
        ? state.layouts.map(l => (l.id === action.payload.id ? action.payload : l))
        : [action.payload, ...state.layouts];
    },
    /** Запрос на создание макета (сага) */
    createLayoutRequested: () => {},

    /** Сбросить состояние (смена пользователя) */
    resetLayouts: () => initialState,

    /** Заменить список макетов данными сервера (откат оптимистичных изменений после ошибки) */
    replaceLayouts: (state, action: PayloadAction<Layout[]>) => {
      state.layouts = action.payload;
    },
  },
});