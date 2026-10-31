/**
 * Саги выделения: снимают выделение, когда выделенный объект удалён
 * или сцена перезагружена (проект, шаблон, отмена/повтор).
 * @module selection/saga
 */

import { put, select, takeEvery } from 'typed-redux-saga';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { selectors } from './selectors';
import { actions } from './slice';

/** Снять выделение, если объект больше не существует. */
function* dropStaleSelectionSaga() {
  const selection = yield* select(selectors.selectSelection);
  if (!selection) return;
  const item = yield* select(selectors.selectSelectedItem);
  const partition = yield* select(selectors.selectSelectedPartitionLive);
  const opening = yield* select(selectors.selectSelectedOpeningLive);
  const missing =
    (selection.kind === 'furniture' && !item) ||
    (selection.kind === 'partition' && !partition) ||
    (selection.kind === 'opening' && !opening);
  if (missing) yield* put(actions.clearSelection());
}

/** Корневая сага выделения */
export function* initSaga() {
  yield* takeEvery(
    [
      furnitureActions.removeFurniture.type,
      furnitureActions.loadFurniture.type,
      furnitureActions.replaceFurniture.type,
      furnitureActions.resetFurniture.type,
      editorActions.removePartition.type,
      editorActions.removeOpening.type,
      editorActions.removeOpeningFromPartition.type,
      editorActions.setOpenings.type,
      editorActions.setPartitions.type,
      editorActions.updatePartition.type,
      editorActions.loadScene.type,
      editorActions.resetEditor.type,
    ],
    dropStaleSelectionSaga,
  );
}
