/**
 * Селектор документа сцены: собирает редактор, мебель, здание и окружение в один документ.
 * Пересчитывается только при изменении данных сцены (UI-состояние вроде активного
 * инструмента новый документ не создаёт) — на этом основана история изменений.
 * @module editor-3d/sceneSelectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { buildingSelectors } from './building/selectors';
import { selectors } from './selectors';
import { buildSceneDocument, type EditorSceneSlice } from './lib/scene/build';

/** Данные активного этажа из слайса редактора (без UI-состояния). */
const selectEditorScene = createSelector(
  [
    selectors.selectDimensions,
    selectors.selectFinishes,
    selectors.selectOuterWalls,
    selectors.selectRemovedWalls,
    selectors.selectLightConfig,
    selectors.selectOpenings,
    selectors.selectPartitions,
    selectors.selectRoomLabels,
    selectors.selectStairs,
  ],
  (dimensions, finishes, outerWalls, removedWalls, light, openings, partitions, rooms, stairs): EditorSceneSlice => ({
    dimensions,
    finishes,
    outerWalls,
    removedWalls,
    light,
    openings,
    partitions,
    rooms,
    stairs,
  }),
);

/** Документ сцены (то, что сохраняется в проект). */
export const selectSceneDocument = createSelector(
  [selectEditorScene, furnitureSelectors.selectFurnitureItems, environmentSelectors.selectEnvironment, buildingSelectors.selectBuildingState],
  buildSceneDocument,
);
