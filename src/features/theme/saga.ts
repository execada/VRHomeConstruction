/**
 * Саги темы: сохранение выбора в localStorage.
 * @module theme/saga
 */

import { takeLatest } from 'typed-redux-saga';
import { writeStored } from '@/shared/lib/storage';
import { actions, THEME_STORAGE_KEY } from './slice';

/** Записать выбранную тему. */
function persistThemeSaga(action: ReturnType<typeof actions.setThemeMode>) {
  writeStored(THEME_STORAGE_KEY, action.payload);
}

/** Корневая сага темы */
export function* initSaga() {
  yield* takeLatest(actions.setThemeMode.type, persistThemeSaga);
}
