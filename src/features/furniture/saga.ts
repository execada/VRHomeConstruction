/**
 * Саги для фичи мебели.
 * Обрабатывают установку размеров модели после её измерения.
 * @module furniture/saga
 */

import { put, takeEvery } from 'typed-redux-saga';
import { actions } from './slice';

/**
 * Обрабатывает экшен setFurnitureReady, обновляя размеры модели в стейте.
 */
function* handleSetFurnitureReady(action: ReturnType<typeof actions.setFurnitureReady>) {
  yield put(actions.updateFurnitureSizes({ itemId: action.payload.itemId, sizes: action.payload.sizes }));
}

export function* initSaga() {
  yield takeEvery(actions.setFurnitureReady.type, handleSetFurnitureReady);
}