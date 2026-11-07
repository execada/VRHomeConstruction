/**
 * Саги подсказок: настройки запоминаются в localStorage при каждом изменении.
 * @module hints/saga
 */

import { select, takeLatest } from 'typed-redux-saga';
import { writeStored } from '@/shared/lib/storage';
import { actions, HINTS_STORAGE_KEY } from './slice';
import type { HintsState } from './types';

/** Записать настройки подсказок. */
function* persistHintsSaga() {
  const { enabled, dismissed, tourDone } = yield* select((state: { hints: HintsState }) => state.hints);
  writeStored(HINTS_STORAGE_KEY, { enabled, dismissed, tourDone });
}

/** Корневая сага подсказок */
export function* initSaga() {
  yield* takeLatest([actions.setEnabled.type, actions.dismiss.type, actions.resetHints.type, actions.finishTour.type], persistHintsSaga);
}
