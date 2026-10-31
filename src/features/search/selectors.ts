/**
 * Селекторы для поиска.
 * @module search/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name } from './slice';
import { SearchState } from './types';

type State = {
  [name]: SearchState;
};

const root = (state: State) => state[name];

/** Поисковый запрос */
const selectSearchQuery = createSelector(root, (search) => search?.query ?? '');
/** Флаг выполнения поиска */
const selectIsSearching = createSelector(root, (search) => search?.isSearching ?? false);
/** Результаты поиска */
const selectSearchResults = createSelector(root, (search) => search?.results ?? []);
/** ID найденного проекта */
const selectFoundProjectId = createSelector(root, (search) => search?.foundProjectId);
/** ID подсвеченных элементов */
const selectHighlightedIds = createSelector(root, (search) => search?.highlightedIds ?? []);
/** ID подсвеченных папок */
const selectHighlightedFolderIds = createSelector(root, (search) => search?.highlightedFolderIds ?? []);
/** Значение в поле ввода */
const selectSearchInputValue = createSelector(root, (search) => search?.inputValue ?? '');
/** Активное меню */
const selectActiveMenuId = createSelector(root, (search) => search?.activeMenuId ?? null);

export const selectors = {
  selectSearchQuery,
  selectIsSearching,
  selectSearchResults,
  selectFoundProjectId,
  selectHighlightedIds,
  selectHighlightedFolderIds,
  selectSearchInputValue,
  selectActiveMenuId,
};