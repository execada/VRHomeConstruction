/**
 * Саги выделения: снимают выделение, когда выделенный объект удалён, сцена перезагружена
 * (проект, шаблон, отмена/повтор) или сменился активный этаж.
 * @module selection/saga
 */

import { put, select, takeEvery } from 'typed-redux-saga';
import { actions as buildingActions } from '@/features/editor-3d/building/slice';
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
  const room = yield* select(selectors.selectSelectedRoom);
  const stair = yield* select(selectors.selectSelectedStair);
  const missing =
    (selection.kind === 'furniture' && !item) ||
    (selection.kind === 'partition' && !partition) ||
    (selection.kind === 'stair' && !stair) ||
    (selection.kind === 'opening' && !opening) ||
    (selection.kind === 'room' && !room);
  if (missing) yield* put(actions.clearSelection());
}

/** Снять выделение: на другом этаже выделенного объекта нет. */
function* clearSelectionSaga() {
  yield* put(actions.clearSelection());
}

/** Корневая сага выделения */
export function* initSaga() {
  yield* takeEvery([buildingActions.floorActivated.type, buildingActions.floorAdded.type, buildingActions.floorRemoved.type], clearSelectionSaga);
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
      editorActions.removeStair.type,
      editorActions.setStairs.type,
      editorActions.loadScene.type,
      editorActions.resetEditor.type,
    ],
    dropStaleSelectionSaga,
  );
}
