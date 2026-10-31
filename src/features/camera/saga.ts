/**
 * Саги камеры: сохранение пользовательских настроек в localStorage.
 * @module camera/saga
 */

import { select, takeLatest } from 'typed-redux-saga';
import { writeStored } from '@/shared/lib/storage';
import { actions, CAMERA_STORAGE_KEY } from './slice';
import { selectors } from './selectors';

/** Записать режим, вид и столкновения. */
function* persistCameraSaga() {
  const mode = yield* select(selectors.selectCameraMode);
  const fixedView = yield* select(selectors.selectFixedView);
  const collisions = yield* select(selectors.selectCollisions);
  writeStored(CAMERA_STORAGE_KEY, { mode, fixedView, collisions });
}

/** Корневая сага камеры */
export function* initSaga() {
  yield* takeLatest([actions.setMode.type, actions.setFixedView.type, actions.setCollisions.type], persistCameraSaga);
}
