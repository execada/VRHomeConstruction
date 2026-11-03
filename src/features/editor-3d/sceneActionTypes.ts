/**
 * Типы действий, меняющих документ сцены (история изменений и автосохранение)
 * и загружающих сцену целиком.
 * @module editor-3d/sceneActionTypes
 */

import { actions as environmentActions } from '@/features/environment/slice';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { actions as editorActions } from './slice';

/** Правки сцены пользователем. */
export const SCENE_EDIT_ACTION_TYPES: string[] = [
  editorActions.setDimensions,
  editorActions.setColors,
  editorActions.setMaterial,
  editorActions.setLight,
  editorActions.addOpening,
  editorActions.updateOpening,
  editorActions.removeOpening,
  editorActions.addPartition,
  editorActions.updatePartition,
  editorActions.removePartition,
  editorActions.addOpeningToPartition,
  editorActions.removeOpeningFromPartition,
  editorActions.setPartitionColor,
  editorActions.setFinish,
  editorActions.setOuterWalls,
  editorActions.setRemovedWalls,
  editorActions.setOpenings,
  editorActions.setPartitions,
  furnitureActions.addFurniture,
  furnitureActions.updateFurniture,
  furnitureActions.duplicateFurniture,
  furnitureActions.removeFurniture,
  furnitureActions.replaceFurniture,
  environmentActions.setSun,
  environmentActions.setSky,
].map((a) => a.type);

/** Загрузка или сброс сцены целиком. */
export const SCENE_LOAD_ACTION_TYPES: string[] = [
  editorActions.loadScene,
  editorActions.loadRoomData,
  editorActions.resetEditor,
  furnitureActions.loadFurniture,
  furnitureActions.resetFurniture,
  environmentActions.loadEnvironment,
  environmentActions.resetEnvironment,
].map((a) => a.type);
