/**
 * Действия загрузки документа сцены во все слайсы (здание, редактор, мебель, окружение).
 * Используются загрузкой проекта, импортом файла, шаблонами и историей изменений.
 * @module editor-3d/sceneActions
 */

import { actions as environmentActions } from '@/features/environment/slice';
import { actions as furnitureActions } from '@/features/furniture/slice';
import type { FurnitureItem } from '@/features/furniture/types';
import { actions as buildingActions } from './building/slice';
import { floorContentOf, floorMetaOf, toEditorPayload } from './lib/scene/build';
import type { SceneDocument } from './lib/scene/schema';
import { actions as editorActions } from './slice';

/**
 * Набор действий, полностью заменяющих сцену документом.
 * @param doc - документ сцены
 * @param activeId - этаж, который сделать активным (если он есть в документе)
 * @param fallbackIndex - номер этажа снизу, если такого этажа нет (отмена добавления этажа — этаж ниже)
 */
export function sceneLoadActions(doc: SceneDocument, activeId?: string | null, fallbackIndex = 0) {
  const active = doc.floors.find((f) => f.id === activeId) ?? doc.floors[Math.max(0, Math.min(fallbackIndex, doc.floors.length - 1))];
  const stash = Object.fromEntries(doc.floors.filter((f) => f.id !== active.id).map((f) => [f.id, floorContentOf(f)]));
  return [
    buildingActions.loaded({ floors: doc.floors.map(floorMetaOf), activeId: active.id, stash, slabThickness: doc.slabThickness }),
    editorActions.loadScene(toEditorPayload(active)),
    furnitureActions.loadFurniture(active.furniture as FurnitureItem[]),
    environmentActions.loadEnvironment(doc.environment),
  ] as const;
}

/** Измеренные габариты моделей по пути (из всех этажей документа). */
function measuredSizes(doc: SceneDocument) {
  return new Map(
    doc.floors
      .flatMap((f) => f.furniture as FurnitureItem[])
      .filter((i) => i.halfWidth && i.halfDepth && i.height)
      .map((i) => [i.modelPath, { halfWidth: i.halfWidth, halfDepth: i.halfDepth, height: i.height }] as const),
  );
}

/**
 * Дополнить предметы всех этажей измеренными габаритами из текущей сцены (по пути модели):
 * габариты — свойство модели, а не правка пользователя, их нельзя «отменять».
 */
export function withMeasuredSizes(target: SceneDocument, current: SceneDocument): SceneDocument {
  const sizes = measuredSizes(current);
  const fill = (items: FurnitureItem[]) => items.map((i) => (i.halfWidth && i.halfDepth && i.height ? i : { ...i, ...sizes.get(i.modelPath) }));
  return { ...target, floors: target.floors.map((f) => ({ ...f, furniture: fill(f.furniture as FurnitureItem[]) })) };
}
