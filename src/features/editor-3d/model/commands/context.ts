/**
 * Контекст команд сцены: доступ к актуальному состоянию и dispatch.
 * Команды читают состояние в момент вызова (не из замыкания React),
 * поэтому корректно работают в обработчиках перетаскивания.
 * @module editor-3d/model/commands/context
 */

import { nanoid, type UnknownAction } from '@reduxjs/toolkit';
import type { FurnitureState } from '@/features/furniture/types';
import type { SelectionState } from '@/features/selection/types';
import { interactionStore, GRID_STEP, WALL_MAGNET } from '../interactionStore';
import type { PlacementOptions } from '../../lib/placement';
import type { BuildingState, EditorState } from '../../types';

/** Части корневого состояния, с которыми работают команды. */
export interface SceneRootState {
  editor: EditorState;
  building: BuildingState;
  furniture: FurnitureState;
  selection: SelectionState;
}

/** Контекст выполнения команд. */
export interface CommandContext {
  getState: () => SceneRootState;
  dispatch: (action: UnknownAction) => unknown;
  /** Сообщение пользователю (например, «нет места на стене») */
  notify: (message: string) => void;
}

/** id черновика предмета из каталога (до добавления в сцену). */
export const DRAFT_ITEM_ID = '__draft__';

/** Новый уникальный id с префиксом. */
export function createId(prefix: string): string {
  return `${prefix}_${nanoid(12)}`;
}

/** Текущие привязки размещения (сетка из состояния взаимодействия). */
export function placementOptions(): PlacementOptions {
  return { gridStep: interactionStore.getState().gridEnabled ? GRID_STEP : null, wallMagnet: WALL_MAGNET };
}
