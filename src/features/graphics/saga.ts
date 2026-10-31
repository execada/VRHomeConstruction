/**
 * Саги графики: сохранение настроек в localStorage.
 * @module graphics/saga
 */

import { select, takeLatest } from 'typed-redux-saga';
import { writeStored } from '@/shared/lib/storage';
import { actions, GRAPHICS_STORAGE_KEY } from './slice';
import { selectors } from './selectors';

/** Записать текущие настройки. */
function* persistGraphicsSaga() {
  const settings = yield* select(selectors.selectGraphics);
  writeStored(GRAPHICS_STORAGE_KEY, settings);
}

/** Корневая сага графики */
export function* initSaga() {
  yield* takeLatest([actions.setPreset.type, actions.updateGraphics.type], persistGraphicsSaga);
}
