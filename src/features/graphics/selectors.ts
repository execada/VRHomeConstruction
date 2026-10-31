/**
 * Селекторы настроек графики.
 * @module graphics/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { DEFAULT_GRAPHICS } from './lib/presets';
import { name, GraphicsSettings } from './slice';

type State = {
  [name]: GraphicsSettings;
};

const root = (state: State) => state[name];

/** Все настройки графики (без createSelector: результат — сам слайс) */
const selectGraphics = (state: State): GraphicsSettings => root(state) ?? DEFAULT_GRAPHICS;
/** Показывать ли счётчик FPS */
const selectShowFps = createSelector(root, (state) => state?.showFps ?? false);

export const selectors = {
  selectGraphics,
  selectShowFps,
};
