/**
 * Преобразования «состояние Redux ↔ документ сцены».
 * Документ — то, что сохраняется в `roomData`; payload — то, что принимает `editor.loadScene`.
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
import type { EditorScenePayload, EditorState, Opening, RoomDimensions } from '../../types';
import { SCENE_SCHEMA_VERSION, type SceneDocument } from './schema';

/** Части состояния редактора, входящие в документ сцены. */
export type EditorSceneSlice = Pick<
  EditorState,
  'dimensions' | 'finishes' | 'outerWalls' | 'removedWalls' | 'light' | 'openings' | 'partitions' | 'rooms'
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

/**
 * Документ сцены из состояния.
 * @param editor - состояние редактора (размеры, отделка, свет, проёмы, перегородки)
 * @param furniture - мебель
 * @param environment - солнце и небо
 */
export function buildSceneDocument(
  editor: EditorSceneSlice,
  furniture: FurnitureItem[],
  environment: EnvironmentState,
): SceneDocument {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    dimensions: editor.dimensions,
    outerWalls: editor.outerWalls,
    finishes: editor.finishes,
    removedWalls: editor.removedWalls,
    light: editor.light,
    environment,
    openings: flattenOpenings(editor.openings),
    partitions: editor.partitions,
    rooms: editor.rooms,
    furniture,
  };
}

/** Payload для `editor.loadScene` из документа. */
export function toEditorPayload(doc: SceneDocument): EditorScenePayload {
  return {
    dimensions: doc.dimensions,
    finishes: doc.finishes,
    outerWalls: doc.outerWalls,
    removedWalls: doc.removedWalls,
    light: doc.light,
    openings: groupOpenings(doc.openings),
    partitions: doc.partitions,
    rooms: doc.rooms,
  };
}

/**
 * Пустая комната заданного размера (новый проект «с нуля»).
 * @param dims - размеры; по умолчанию 4 × 3 × 4 м
 */
export function createEmptyScene(
  dims: RoomDimensions = { width: DEFAULT_ROOM_WIDTH, height: DEFAULT_ROOM_HEIGHT, depth: DEFAULT_ROOM_DEPTH },
): SceneDocument {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    dimensions: dims,
    outerWalls: DEFAULT_OUTER_WALLS,
    finishes: DEFAULT_FINISHES,
    removedWalls: [],
    light: DEFAULT_LIGHT,
    environment: DEFAULT_ENVIRONMENT,
    openings: [],
    partitions: [],
    rooms: [],
    furniture: [],
  };
}
