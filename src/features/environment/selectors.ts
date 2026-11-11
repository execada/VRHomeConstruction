/**
 * Селекторы окружения.
 * @module environment/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { DEFAULT_ENVIRONMENT, DEFAULT_RESIDENCE } from './constants';
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

/** Квартира в доме (у старых проектов — выключено) */
const selectResidence = createSelector(root, (state) => state?.residence ?? DEFAULT_RESIDENCE);

export const selectors = {
  selectEnvironment,
  selectSun,
  selectSky,
  selectResidence,
};
