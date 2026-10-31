/**
 * Селекторы для универсальной кнопки.
 * @module universal-button/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, UniversalButtonState } from './slice';

type State = {
  [name]: UniversalButtonState;
};

const root = (state: State) => state[name];

/** Открыто ли модальное окно */
const selectIsOpen = createSelector(root, (state) => state?.isOpen ?? false);

export const selectors = {
  selectIsOpen,
};