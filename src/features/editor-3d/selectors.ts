/**
 * Селекторы для редактора 3D-сцены.
 * Предоставляют мемоизированный доступ к состоянию редактора.
 * @module editor-3d/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name, EditorState } from './slice';
import { DEFAULT_FINISHES, DEFAULT_LIGHT, DEFAULT_OUTER_WALLS } from './constants';
import type { RoomLabel, WallSide } from './types';

type State = {
  [name]: EditorState;
};

const root = (state: State) => state[name];

/** Полное состояние редактора */
const selectEditor = createSelector(root, (state) => state);
/** Размеры комнаты */
const selectDimensions = createSelector(root, (state) => state?.dimensions);
/** Цвета стен/пола/потолка */
const selectColors = createSelector(root, (state) => state?.colors);
/** Материалы (текстуры) поверхностей */
const selectMaterials = createSelector(
  root,
  (state) => state?.materials ?? { walls: 'color', floor: 'color', ceiling: 'color' },
);
/** Конфигурация освещения */
const selectLight = createSelector(root, (state) => state?.light);
/** Текущий режим просмотра */
const selectViewMode = createSelector(root, (state) => state?.viewMode);
/** Активный инструмент */
const selectActiveTool = createSelector(root, (state) => state?.activeTool);
/** Проёмы на стенах */
const selectOpenings = createSelector(root, (state) => state?.openings ?? {});
/** Стена, выбранная для 2D-просмотра */
const selectViewedWallId = createSelector(root, (state) => state?.viewedWallId ?? 'front');
/** Выбранный проём для редактирования */
const selectSelectedOpening = createSelector(root, (state) => state?.selectedOpening);
/** Все перегородки */
const selectPartitions = createSelector(root, (state) => state?.partitions ?? []);
/** Выбранная перегородка */
const selectSelectedPartition = createSelector(root, (state) => state?.selectedPartition);
/** Цвета перегородок */
const selectPartitionColors = createSelector(root, (state) => state?.partitionColors ?? {});
/** Позиция персонажа */
const selectPlayerPosition = createSelector(root, (state) => state?.playerPosition);
/** Ротация персонажа */
const selectPlayerRotation = createSelector(root, (state) => state?.playerRotation);
/** Отделка поверхностей */
const selectFinishes = createSelector(root, (state) => state?.finishes ?? DEFAULT_FINISHES);
/** Толщина и материал внешних стен */
const selectOuterWalls = createSelector(root, (state) => state?.outerWalls ?? DEFAULT_OUTER_WALLS);
const NO_WALLS: WallSide[] = [];
const NO_ROOMS: RoomLabel[] = [];
/** Названия и виды помещений */
const selectRoomLabels = createSelector(root, (state) => state?.rooms ?? NO_ROOMS);
/** Удалённые внешние стены */
const selectRemovedWalls = createSelector(root, (state) => state?.removedWalls ?? NO_WALLS);
/**
 * Свет комнаты с заполненными новыми полями (старые проекты).
 * Зависит только от `light`, чтобы UI-действия не создавали новый объект.
 */
const selectLightConfig = createSelector(selectLight, (light) => ({ ...DEFAULT_LIGHT, ...light }));

/** Объект с именованными селекторами для удобного импорта */
export const selectors = {
  selectEditor,
  selectDimensions,
  selectColors,
  selectMaterials,
  selectLight,
  selectViewMode,
  selectActiveTool,
  selectOpenings,
  selectViewedWallId,
  selectSelectedOpening,
  selectPartitions,
  selectSelectedPartition,
  selectPartitionColors,
  selectPlayerPosition,
  selectPlayerRotation,
  selectFinishes,
  selectOuterWalls,
  selectRemovedWalls,
  selectRoomLabels,
  selectLightConfig,
};