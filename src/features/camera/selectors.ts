/**
 * Селекторы камеры.
 * @module camera/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, CameraState } from './slice';

type State = {
  [name]: CameraState;
};

const root = (state: State) => state[name];

/** Режим камеры */
const selectCameraMode = createSelector(root, (state) => state?.mode ?? 'orbit');
/** Фиксированный вид */
const selectFixedView = createSelector(root, (state) => state?.fixedView ?? 'iso');
/** Столкновения от первого лица */
const selectCollisions = createSelector(root, (state) => state?.collisions ?? true);
/** Счётчик запросов перехода к виду */
const selectViewRequest = createSelector(root, (state) => state?.viewRequest ?? 0);

export const selectors = {
  selectCameraMode,
  selectFixedView,
  selectCollisions,
  selectViewRequest,
};
