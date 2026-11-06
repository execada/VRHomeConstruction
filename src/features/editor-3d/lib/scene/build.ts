/**
 * Преобразования «состояние Redux ↔ документ сцены».
 * Документ — то, что сохраняется в `roomData`; payload — то, что принимает `editor.loadScene`.
 * Содержимое активного этажа берётся из слайсов редактора и мебели, остальных — из слайса здания.
 * @module editor-3d/lib/scene/build
 */

import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { EnvironmentState } from '@/features/environment/types';
import type { FurnitureItem } from '@/features/furniture/types';
import {
  DEFAULT_FINISHES,
  DEFAULT_LIGHT,
  DEFAULT_ROOM_DEPTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_OUTER_WALLS,
} from '../../constants';
import type { BuildingState, EditorScenePayload, EditorState, FloorContent, FloorMeta, Opening, RoomDimensions } from '../../types';
import { DEFAULT_SLAB_THICKNESS, FIRST_FLOOR_ID, floorName } from '../building/floors';
import { SCENE_SCHEMA_VERSION, type FloorDocument, type SceneDocument } from './schema';

/** Части состояния редактора, входящие в документ сцены (содержимое активного этажа). */
export type EditorSceneSlice = Pick<
  EditorState,
  'dimensions' | 'finishes' | 'outerWalls' | 'removedWalls' | 'light' | 'openings' | 'partitions' | 'rooms' | 'stairs'
>;

/** Разложить проёмы по стенам. */
export function groupOpenings(openings: Opening[]): { [wallId: string]: Opening[] } {
  return openings.reduce<{ [wallId: string]: Opening[] }>(
    (acc, o) => ({ ...acc, [o.wallId]: [...(acc[o.wallId] ?? []), o] }),
    {},
  );
}

/** Собрать плоский список проёмов (wallId берётся из ключа). */
export function flattenOpenings(openings: { [wallId: string]: Opening[] }): Opening[] {
  return Object.entries(openings).flatMap(([wallId, list]) => list.map((o) => ({ ...o, wallId })));
}

/** Содержимое активного этажа из слайсов редактора и мебели. */
export function liveFloorContent(editor: EditorSceneSlice, furniture: FurnitureItem[]): FloorContent {
  return {
    dimensions: editor.dimensions,
    finishes: editor.finishes,
    outerWalls: editor.outerWalls,
    removedWalls: editor.removedWalls,
    light: editor.light,
    openings: editor.openings,
    partitions: editor.partitions,
    rooms: editor.rooms,
    stairs: editor.stairs,
    furniture,
  };
}

/** Этаж документа из метаданных и содержимого. */
export function floorDocument(meta: FloorMeta, content: FloorContent): FloorDocument {
  return {
    id: meta.id,
    name: meta.name,
    offset: meta.offset,
    dimensions: content.dimensions,
    outerWalls: content.outerWalls,
    finishes: content.finishes,
    removedWalls: content.removedWalls,
    light: content.light,
    openings: flattenOpenings(content.openings),
    partitions: content.partitions,
    rooms: content.rooms,
    stairs: content.stairs,
    furniture: content.furniture,
  };
}

/** Payload для `editor.loadScene` из этажа документа. */
export function toEditorPayload(floor: FloorDocument): EditorScenePayload {
  return {
    dimensions: floor.dimensions,
    finishes: floor.finishes,
    outerWalls: floor.outerWalls,
    removedWalls: floor.removedWalls,
    light: floor.light,
    openings: groupOpenings(floor.openings),
    partitions: floor.partitions,
    rooms: floor.rooms,
    stairs: floor.stairs,
  };
}

/** Содержимое этажа (как в состоянии) из этажа документа. */
export function floorContentOf(floor: FloorDocument): FloorContent {
  return { ...toEditorPayload(floor), furniture: floor.furniture as FurnitureItem[] };
}

/** Метаданные этажа из этажа документа. */
export function floorMetaOf(floor: FloorDocument): FloorMeta {
  return { id: floor.id, name: floor.name, offset: floor.offset };
}

/**
 * Документ сцены из состояния.
 * @param editor - содержимое активного этажа (слайс редактора)
 * @param furniture - мебель активного этажа
 * @param environment - солнце и небо
 * @param building - этажи, активный этаж и содержимое остальных
 */
export function buildSceneDocument(
  editor: EditorSceneSlice,
  furniture: FurnitureItem[],
  environment: EnvironmentState,
  building: BuildingState,
): SceneDocument {
  const live = liveFloorContent(editor, furniture);
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    environment,
    slabThickness: building.slabThickness,
    floors: building.floors.map((meta) => floorDocument(meta, meta.id === building.activeId ? live : building.stash[meta.id] ?? live)),
  };
}

/** Размеры комнаты по умолчанию: 4 × 3 × 4 м. */
const DEFAULT_DIMENSIONS: RoomDimensions = { width: DEFAULT_ROOM_WIDTH, height: DEFAULT_ROOM_HEIGHT, depth: DEFAULT_ROOM_DEPTH };

/**
 * Пустой этаж заданного размера.
 * @param dims - размеры
 * @param meta - id, название и смещение (по умолчанию — первый этаж в центре)
 */
export function createEmptyFloor(dims: RoomDimensions = DEFAULT_DIMENSIONS, meta: Partial<FloorMeta> = {}): FloorDocument {
  return {
    id: meta.id ?? FIRST_FLOOR_ID,
    name: meta.name ?? floorName(0),
    offset: meta.offset ?? [0, 0],
    dimensions: dims,
    outerWalls: DEFAULT_OUTER_WALLS,
    finishes: DEFAULT_FINISHES,
    removedWalls: [],
    light: DEFAULT_LIGHT,
    openings: [],
    partitions: [],
    rooms: [],
    stairs: [],
    furniture: [],
  };
}

/**
 * Документ из этажей (снизу вверх).
 * @param floors - этажи
 * @param environment - солнце и небо
 * @param slabThickness - толщина перекрытия
 */
export function sceneOf(floors: FloorDocument[], environment: EnvironmentState = DEFAULT_ENVIRONMENT, slabThickness = DEFAULT_SLAB_THICKNESS): SceneDocument {
  return { schemaVersion: SCENE_SCHEMA_VERSION, environment, slabThickness, floors };
}

/**
 * Пустая комната заданного размера (новый проект «с нуля»): один этаж.
 * @param dims - размеры; по умолчанию 4 × 3 × 4 м
 */
export function createEmptyScene(dims: RoomDimensions = DEFAULT_DIMENSIONS): SceneDocument {
  return sceneOf([createEmptyFloor(dims)]);
}
