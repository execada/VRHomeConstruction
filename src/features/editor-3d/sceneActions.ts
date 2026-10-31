/**
 * Действия загрузки документа сцены во все слайсы (редактор, мебель, окружение).
 * Используются загрузкой проекта, импортом файла, шаблонами и историей изменений.
 * @module editor-3d/sceneActions
 */

import { actions as environmentActions } from '@/features/environment/slice';
import { actions as furnitureActions } from '@/features/furniture/slice';
import type { FurnitureItem } from '@/features/furniture/types';
import { toEditorPayload } from './lib/scene/build';
import type { SceneDocument } from './lib/scene/schema';
import { actions as editorActions } from './slice';

/** Набор действий, полностью заменяющих сцену документом. */
export function sceneLoadActions(doc: SceneDocument) {
  return [
    editorActions.loadScene(toEditorPayload(doc)),
    furnitureActions.loadFurniture(doc.furniture as FurnitureItem[]),
    environmentActions.loadEnvironment(doc.environment),
  ] as const;
}

/**
 * Дополнить предметы измеренными габаритами из текущей сцены (по пути модели):
 * габариты — свойство модели, а не правка пользователя, их нельзя «отменять».
 */
export function withMeasuredSizes(target: FurnitureItem[], current: FurnitureItem[]): FurnitureItem[] {
  const sizes = new Map(
    current
      .filter((i) => i.halfWidth && i.halfDepth && i.height)
      .map((i) => [i.modelPath, { halfWidth: i.halfWidth, halfDepth: i.halfDepth, height: i.height }] as const),
  );
  return target.map((i) => (i.halfWidth && i.halfDepth && i.height ? i : { ...i, ...sizes.get(i.modelPath) }));
}
