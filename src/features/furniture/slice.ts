/**
 * Redux Slice для управления мебелью.
 * Содержит редюсеры для добавления, обновления, удаления и выбора мебели.
 * @module furniture/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FurnitureItem, FurnitureState } from './types';

const initialState: FurnitureState = {
  items: [],
  selectedFurniturePath: undefined,
  selectedFurniture: null,
  showFurnitureModal: false,
};

export const { actions, name, reducer } = createSlice({
  name: 'furniture',
  initialState,
  reducers: {
    /** Сбросить состояние (выход из редактора) */
    resetFurniture: () => initialState,

    /** Добавить новый предмет мебели */
    addFurniture(state, action: PayloadAction<FurnitureItem>) {
      state.items.push(action.payload);
    },
    /** Обновить существующий предмет */
    updateFurniture(state, action: PayloadAction<FurnitureItem>) {
      state.items = state.items.map(i => i.id === action.payload.id ? action.payload : i);
      if (state.selectedFurniture?.id === action.payload.id) {
        state.selectedFurniture = action.payload;
      }
    },
    /** Дублировать предмет (со смещением, новая копия выделяется) */
    duplicateFurniture(state, action: PayloadAction<string>) {
      const item = state.items.find(i => i.id === action.payload);
      if (!item) return;
      const copy: FurnitureItem = {
        ...item,
        id: `furn_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        position: [item.position[0] + 0.4, item.position[1], item.position[2] + 0.4],
      };
      state.items.push(copy);
      state.selectedFurniture = copy;
      state.showFurnitureModal = true;
    },
    /** Удалить предмет по id */
    removeFurniture(state, action: PayloadAction<string>) {
      state.items = state.items.filter(i => i.id !== action.payload);
      if (state.selectedFurniture?.id === action.payload) {
        state.selectedFurniture = null;
        state.showFurnitureModal = false;
      }
    },
    /** Установить выбранный путь модели для размещения */
    setSelectedFurniturePath(state, action: PayloadAction<string | undefined>) {
      state.selectedFurniturePath = action.payload;
    },
    /** Выделить предмет мебели для редактирования */
    selectFurniture(state, action: PayloadAction<string | null>) {
      const id = action.payload;
      state.selectedFurniture = id ? state.items.find(i => i.id === id) || null : null;
      state.showFurnitureModal = id !== null;
    },
    /** Закрыть модалку мебели */
    hideFurnitureModal(state) {
      state.showFurnitureModal = false;
      state.selectedFurniture = null;
    },
    /** Загрузить мебель из проекта */
    loadFurniture(state, action: PayloadAction<FurnitureItem[]>) {
      state.items = action.payload;
    },
    /** Запрос на установку размеров (обрабатывается сагой) */
    setFurnitureReady(_state, _action: PayloadAction<{
      itemId: string;
      sizes: { halfWidth: number; halfDepth: number; height: number };
    }>) {},
    /**
     * Сохранить измеренные размеры модели.
     * Позиция не меняется: модели нормализованы так, что y = 0 — низ на полу
     * (раньше здесь поднимали предмет на половину высоты, из-за чего он «висел» или проваливался).
     */
    updateFurnitureSizes(state, action: PayloadAction<{
      itemId: string;
      sizes: { halfWidth: number; halfDepth: number; height: number };
    }>) {
      const { itemId, sizes } = action.payload;
      state.items = state.items.map(i => (i.id === itemId ? { ...i, ...sizes } : i));
      if (state.selectedFurniture?.id === itemId) {
        state.selectedFurniture = { ...state.selectedFurniture, ...sizes };
      }
    },
    /** Заменить всю мебель одним действием (пересчёт после изменения комнаты) */
    replaceFurniture(state, action: PayloadAction<FurnitureItem[]>) {
      state.items = action.payload;
    },
  },
});

export type { FurnitureState };