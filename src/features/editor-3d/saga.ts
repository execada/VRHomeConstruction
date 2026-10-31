/**
 * Саги редактора 3D-сцены.
 * Обрабатывают создание проёмов (окон/дверей) с автоматическим определением типа и позиции.
 * @module editor-3d/saga
 */

import { put, takeEvery, select } from 'typed-redux-saga';
import { actions } from './slice';
import { selectors } from './selectors';
import { Opening } from './types';

/**
 * Обрабатывает запрос на создание проёма.
 * Определяет тип проёма (окно/дверь) на основе активного инструмента,
 * устанавливает размеры по умолчанию и добавляет проём к указанной стене.
 * @param action - экшен createOpeningRequested
 */
function* handleCreateOpeningSaga(action: ReturnType<typeof actions.createOpeningRequested>) {
  const { wallId, point } = action.payload;
  const activeTool = yield* select(selectors.selectActiveTool);
  const type = activeTool === 'window' ? 'window' : 'door';

  const width = 0.8;
  const height = type === 'door' ? 2.1 : 1.2;

  const opening: Opening = {
    id: `${type}_${Date.now()}`,
    wallId,
    type,
    position: [point.x, point.y],
    width,
    height,
  };

  yield put(actions.addOpening({ wallId, opening }));
  yield put(actions.setActiveTool('select'));
}

/** Корневая сага редактора */
export function* initSaga() {
  yield takeEvery(actions.createOpeningRequested.type, handleCreateOpeningSaga);
}