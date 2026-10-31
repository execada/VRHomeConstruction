/**
 * Redux Slice для поиска.
 * Управляет строкой запроса и результатами.
 * @module search/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SearchState } from './types';

const initialState: SearchState = {
  query: '',
  isSearching: false,
  results: [],
  foundProjectId: null,
  highlightedIds: [],
  highlightedFolderIds: [],
  inputValue: '',
  activeMenuId: null,
};

export const { actions, name, reducer } = createSlice({
  name: 'search',
  initialState,
  reducers: {
    /** Установить поисковый запрос */
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
      state.isSearching = action.payload.length > 0;
    },
    /** Установить результаты поиска */
    setSearchResults: (state, action: PayloadAction<string[]>) => {
      state.results = action.payload;
      state.foundProjectId = action.payload.length > 0 ? action.payload[0] : null;
      state.isSearching = false;
    },
    /** Подсветить элементы */
    setHighlightedIds: (state, action: PayloadAction<string[]>) => {
      state.highlightedIds = action.payload;
    },
    /** Подсветить папки */
    setHighlightedFolderIds: (state, action: PayloadAction<string[]>) => {
      state.highlightedFolderIds = action.payload;
    },
    /** Очистить поиск */
    clearSearch: (state) => {
      state.query = '';
      state.isSearching = false;
      state.results = [];
      state.foundProjectId = null;
      state.highlightedIds = [];
      state.highlightedFolderIds = [];
      state.inputValue = '';
      state.activeMenuId = null;
    },
    /** Установить значение в поле ввода */
    setSearchInputValue: (state, action: PayloadAction<string>) => {
      state.inputValue = action.payload;
    },
    /** Установить активное меню */
    setActiveMenuId: (state, action: PayloadAction<string | null>) => {
      state.activeMenuId = action.payload;
    },
  },
});