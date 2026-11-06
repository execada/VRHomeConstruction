/**
 * Миграция документа сцены v3 → v4: квартира становится первым этажом здания
 * без потерь — те же размеры, стены, проёмы и двери, помещения, свет и мебель;
 * лестниц нет, этаж не смещён, перекрытие — толщины по умолчанию.
 * @module editor-3d/lib/scene/migrateV3
 */

import { DEFAULT_SLAB_THICKNESS, FIRST_FLOOR_ID, floorName } from '../building/floors';
import { SCENE_SCHEMA_VERSION, type SceneDocument, type SceneDocumentV3 } from './schema';

/**
 * Перевести проверенный документ v3 в v4 (один этаж).
 * @param doc - документ v3 (после проверки схемой или «спасения» по частям)
 */
export function migrateV3(doc: SceneDocumentV3): SceneDocument {
  const { schemaVersion: _version, environment, ...storey } = doc;
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    environment,
    slabThickness: DEFAULT_SLAB_THICKNESS,
    floors: [{ id: FIRST_FLOOR_ID, name: floorName(0), offset: [0, 0], ...storey, stairs: [] }],
  };
}
