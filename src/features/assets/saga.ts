/**
 * Саги каталога ассетов: загрузка манифеста при старте приложения.
 * @module assets/saga
 */

import { call, put, takeLatest } from 'typed-redux-saga';
import { fetchManifest } from './lib/manifest';
import { actions } from './slice';

/** Загрузить манифест; при ошибке приложение продолжает работать со встроенными ассетами. */
function* loadManifestSaga() {
  try {
    const manifest = yield* call(fetchManifest);
    yield* put(actions.manifestLoaded(manifest));
  } catch (error) {
    console.warn('Не удалось загрузить каталог ассетов', error);
    yield* put(actions.manifestFailed('Каталог моделей и текстур временно недоступен'));
  }
}

/** Корневая сага ассетов */
export function* initSaga() {
  yield* takeLatest(actions.loadManifestRequested.type, loadManifestSaga);
  yield* put(actions.loadManifestRequested());
}
