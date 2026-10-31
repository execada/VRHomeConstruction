/**
 * Селекторы окружения.
 * @module environment/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { DEFAULT_ENVIRONMENT } from './constants';
import { name, EnvironmentState } from './slice';

type State = {
  [name]: EnvironmentState;
};

const root = (state: State) => state[name];

/** Всё окружение (без createSelector: результат — сам слайс, мемоизировать нечего) */
const selectEnvironment = (state: State): EnvironmentState => root(state) ?? DEFAULT_ENVIRONMENT;
/** Настройки солнца */
const selectSun = createSelector(root, (state) => state?.sun ?? DEFAULT_ENVIRONMENT.sun);
/** Настройки неба */
const selectSky = createSelector(root, (state) => state?.sky ?? DEFAULT_ENVIRONMENT.sky);

export const selectors = {
  selectEnvironment,
  selectSun,
  selectSky,
};
