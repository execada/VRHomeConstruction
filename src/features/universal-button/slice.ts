/**
 * Redux Slice для универсальной кнопки.
 * @module universal-button/slice
 */

import { createSlice } from '@reduxjs/toolkit';

export interface UniversalButtonState {
  isOpen: boolean;
}

const initialState: UniversalButtonState = {
  isOpen: false,
};

export const { actions, name, reducer } = createSlice({
  name: 'universalButton',
  initialState,
  reducers: {
    /** Открыть модальное окно */
    openModal: (state) => {
      state.isOpen = true;
    },
    /** Закрыть модальное окно */
    closeModal: (state) => {
      state.isOpen = false;
    },
  },
});