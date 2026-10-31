/**
 * Селектор документа сцены: собирает редактор, мебель и окружение в один документ.
 * Пересчитывается только при изменении данных сцены (UI-состояние вроде активного
 * инструмента новый документ не создаёт) — на этом основана история изменений.
 * @module editor-3d/sceneSelectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { selectors } from './selectors';
import { buildSceneDocument, type EditorSceneSlice } from './lib/scene/build';

/** Данные сцены из слайса редактора (без UI-состояния). */
const selectEditorScene = createSelector(
  [
    selectors.selectDimensions,
    selectors.selectFinishes,
    selectors.selectWallThickness,
    selectors.selectRemovedWalls,
    selectors.selectLightConfig,
    selectors.selectOpenings,
    selectors.selectPartitions,
  ],
  (dimensions, finishes, wallThickness, removedWalls, light, openings, partitions): EditorSceneSlice => ({
    dimensions,
    finishes,
    wallThickness,
    removedWalls,
    light,
    openings,
    partitions,
  }),
);

/** Документ сцены v2 (то, что сохраняется в проект). */
export const selectSceneDocument = createSelector(
  [selectEditorScene, furnitureSelectors.selectFurnitureItems, environmentSelectors.selectEnvironment],
  buildSceneDocument,
);
