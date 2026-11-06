/**
 * Redux Slice здания: этажи снизу вверх (название, смещение), активный этаж, содержимое
 * неактивных этажей и толщина перекрытия.
 *
 * Содержимое активного этажа хранится в слайсах `editor` и `furniture` — поэтому смена
 * этажа, добавление и удаление — одно действие, которое меняет все три слайса сразу
 * (они обрабатывают его в extraReducers): документ сцены ни в какой момент не бывает
 * «наполовину переключён».
 * @module editor-3d/building/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_SLAB_THICKNESS, FIRST_FLOOR_ID, floorName } from '../lib/building/floors';
import type { BuildingState, FloorContent, FloorMeta } from '../types';

const initialState: BuildingState = {
  floors: [{ id: FIRST_FLOOR_ID, name: floorName(0), offset: [0, 0] }],
  activeId: FIRST_FLOOR_ID,
  stash: {},
  slabThickness: DEFAULT_SLAB_THICKNESS,
};

/** Сменить активный этаж: уходящий этаж убирается в stash, входящий загружается в редактор. */
export interface FloorSwap {
  id: string;
  /** Содержимое уходящего (бывшего активного) этажа */
  outgoing: FloorContent;
  /** Содержимое нового активного этажа */
  incoming: FloorContent;
}

/** Убрать текущий активный этаж в stash и сделать активным другой. */
function swapIn(state: BuildingState, id: string, outgoing: FloorContent | null) {
  const stash = { ...state.stash };
  if (outgoing && state.floors.some((f) => f.id === state.activeId)) stash[state.activeId] = outgoing;
  delete stash[id];
  state.stash = stash;
  state.activeId = id;
}

export const { actions, name, reducer } = createSlice({
  name: 'building',
  initialState,
  reducers: {
    /** Загрузить здание (проект, шаблон, отмена/повтор); содержимое активного этажа — отдельными действиями */
    loaded: (_state, action: PayloadAction<BuildingState>) => action.payload,

    /** Сделать этаж активным */
    floorActivated: (state, action: PayloadAction<FloorSwap>) => {
      swapIn(state, action.payload.id, action.payload.outgoing);
    },

    /** Добавить этаж (по индексу снизу) и сделать его активным */
    floorAdded: (state, action: PayloadAction<{ floor: FloorMeta; index: number; outgoing: FloorContent; incoming: FloorContent }>) => {
      const { floor, index, outgoing } = action.payload;
      state.floors = [...state.floors.slice(0, index), floor, ...state.floors.slice(index)];
      swapIn(state, floor.id, outgoing);
    },

    /**
     * Удалить этаж. Если он был активным — активным становится `next`
     * (его содержимое загружается в редактор).
     */
    floorRemoved: (state, action: PayloadAction<{ id: string; next?: { id: string; incoming: FloorContent } }>) => {
      const { id, next } = action.payload;
      if (state.floors.length <= 1 || !state.floors.some((f) => f.id === id)) return;
      state.floors = state.floors.filter((f) => f.id !== id);
      const stash = { ...state.stash };
      delete stash[id];
      state.stash = stash;
      if (next && state.activeId === id) swapIn(state, next.id, null);
    },

    /** Переименовать этаж */
    floorRenamed: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.floors = state.floors.map((f) => (f.id === action.payload.id ? { ...f, name: action.payload.name } : f));
    },

    /** Сместить этаж на плане */
    floorOffsetSet: (state, action: PayloadAction<{ id: string; offset: [number, number] }>) => {
      state.floors = state.floors.map((f) => (f.id === action.payload.id ? { ...f, offset: action.payload.offset } : f));
    },

    /** Толщина перекрытия */
    slabThicknessSet: (state, action: PayloadAction<number>) => {
      state.slabThickness = action.payload;
    },

    /** Сброс (выход из редактора) */
    reset: () => initialState,
  },
});

export type { BuildingState };
