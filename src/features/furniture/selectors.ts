/**
 * Селекторы для мебели.
 * Предоставляют мемоизированный доступ к списку мебели и выделенному предмету.
 * @module furniture/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, FurnitureState } from './slice';

type State = {
  [name]: FurnitureState;
};

const root = (state: State) => state[name];

/** Все предметы мебели */
const selectFurnitureItems = createSelector(root, (state) => state?.items ?? []);
/** Выделенный предмет */
const selectSelectedFurniture = createSelector(root, (state) => state?.selectedFurniture);
/** Открыта ли модалка */
const selectShowFurnitureModal = createSelector(root, (state) => state?.showFurnitureModal ?? false);
/** Выбранный путь модели */
const selectSelectedFurniturePath = createSelector(root, (state) => state?.selectedFurniturePath);

export const selectors = {
  selectFurnitureItems,
  selectSelectedFurniture,
  selectShowFurnitureModal,
  selectSelectedFurniturePath,
};