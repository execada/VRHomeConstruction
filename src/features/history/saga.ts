/**
 * Сага истории изменений.
 *
 * Хранит «зафиксированный» документ сцены. На каждое изменяющее сцену действие
 * сравнивает новый документ с зафиксированным (по ссылке — селектор мемоизирован)
 * и записывает старый в историю, склеивая серии изменений (перетаскивание).
 * @module history/saga
 */

import { put, select, takeEvery } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { selectSceneDocument } from '@/features/editor-3d/sceneSelectors';
import { sceneLoadActions, withMeasuredSizes } from '@/features/editor-3d/sceneActions';
import { SCENE_EDIT_ACTION_TYPES, SCENE_LOAD_ACTION_TYPES } from '@/features/editor-3d/sceneActionTypes';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';
import { changeKey, shouldCoalesce, type ChangeMark } from './lib/coalesce';
import { floorToShow } from './lib/floorFocus';
import { selectors } from './selectors';
import { actions } from './slice';

/** Изменения, которые не являются правкой пользователя (измерение габаритов модели). */
const SILENT = [furnitureActions.updateFurnitureSizes.type];

/**
 * Применить снимок ко всем слайсам. Активным остаётся тот же этаж, а если шаг меняет
 * только другой этаж — активным становится он (правка видна там, где отменяется).
 */
function* applyDocument(doc: SceneDocument, current: SceneDocument) {
  const activeId = yield* select(buildingSelectors.selectActiveFloorId);
  const activeIndex = yield* select(buildingSelectors.selectActiveIndex);
  for (const action of sceneLoadActions(withMeasuredSizes(doc, current), floorToShow(doc, current, activeId), activeIndex)) {
    yield* put(action);
  }
}

/** Корневая сага истории */
export function* initSaga() {
  let committed: SceneDocument | null = null;
  let lastChange: ChangeMark | null = null;
  let applying = false;

  function* onTracked(action: Action) {
    if (applying) return;
    const doc = yield* select(selectSceneDocument);
    if (committed === null || doc === committed) {
      committed = doc;
      return;
    }
    const { mode, gestureId } = interactionStore.getState();
    const inGesture = mode === 'dragging' || mode === 'rotating';
    const mark = { key: changeKey(action), time: Date.now(), gesture: inGesture ? gestureId : undefined };
    if (!shouldCoalesce(lastChange, mark)) yield* put(actions.record(committed));
    lastChange = mark;
    committed = doc;
  }

  function* onLoad() {
    if (applying) return;
    committed = yield* select(selectSceneDocument);
    lastChange = null;
    yield* put(actions.clearHistory());
  }

  function* onSilent() {
    if (!applying) committed = yield* select(selectSceneDocument);
  }

  function* step(direction: 'back' | 'forward') {
    const stack = yield* select(direction === 'back' ? selectors.selectPast : selectors.selectFuture);
    const target = stack[stack.length - 1];
    if (!target) return;
    const current = yield* select(selectSceneDocument);
    applying = true;
    try {
      yield* put(direction === 'back' ? actions.stepBack(current) : actions.stepForward(current));
      yield* applyDocument(target, current);
    } finally {
      applying = false;
    }
    committed = yield* select(selectSceneDocument);
    lastChange = null;
  }

  yield* takeEvery(SCENE_EDIT_ACTION_TYPES, onTracked);
  yield* takeEvery(SCENE_LOAD_ACTION_TYPES, onLoad);
  yield* takeEvery(SILENT, onSilent);
  yield* takeEvery(actions.undoRequested.type, () => step('back'));
  yield* takeEvery(actions.redoRequested.type, () => step('forward'));
}
