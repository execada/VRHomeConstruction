/**
 * Миграция документа сцены v1 → v3 (формат v2 при этом пропускается: поля v3
 * заполняются так же, как при миграции v2 → v3, см. migrateV2). Дальше документ v3
 * становится одним этажом документа v4 (см. migrateV3).
 *
 * Отличия v1:
 * - цвета и материалы поверхностей в `colors` / `materials` вместо `finishes`;
 * - y проёма отсчитывался от середины стены, а у передней стены ось u была зеркальной;
 * - y мебели зависел от модели (часто — половина высоты), допускался наклон;
 * - цвет перегородки хранился в `color`.
 * @module editor-3d/lib/scene/migrate
 */

import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { FurnitureItem } from '@/features/furniture/types';
import { clamp } from '@/shared/lib/math/geometry2d';
import { isHexColor } from '@/shared/lib/color/colorTemperature';
import { DEFAULT_FINISHES, DEFAULT_LIGHT, DEFAULT_OUTER_WALLS, DEFAULT_ROOM_DEPTH, DEFAULT_ROOM_HEIGHT, DEFAULT_ROOM_WIDTH } from '../../constants';
import type { LightConfig, Opening, Partition, RoomDimensions, RoomFinishes, SurfaceFinish } from '../../types';
import { clampOpening } from '../openings';
import { clampPartition } from '../partitions';
import { isWallSide, wallFrame } from '../walls';
import { LEGACY_DOOR } from '../doors';
import { legacyPartitionMaterial } from './migrateV2';
import { furnitureSchema, modelPathSchema, SCENE_LIMITS, type SceneDocumentV3 } from './schema';

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const tuple3 = (v: unknown): [number, number, number] =>
  Array.isArray(v) ? [num(v[0], 0), num(v[1], 0), num(v[2], 0)] : [0, 0, 0];

/** Размеры комнаты v1 с ограничением допустимыми диапазонами. */
export function migrateDimensions(raw: unknown): RoomDimensions {
  const d = isObject(raw) ? raw : {};
  return {
    width: clamp(num(d.width, DEFAULT_ROOM_WIDTH), SCENE_LIMITS.width[0], SCENE_LIMITS.width[1]),
    height: clamp(num(d.height, DEFAULT_ROOM_HEIGHT), SCENE_LIMITS.height[0], SCENE_LIMITS.height[1]),
    depth: clamp(num(d.depth, DEFAULT_ROOM_DEPTH), SCENE_LIMITS.depth[0], SCENE_LIMITS.depth[1]),
  };
}

/** Отделка из пары «цвет + материал» v1. */
function legacyFinish(color: unknown, material: unknown, fallback: SurfaceFinish): SurfaceFinish {
  const textureId = typeof material === 'string' && material !== 'color' && material !== 'none' ? material : null;
  return { textureId, color: isHexColor(color) ? color : fallback.color, scale: 1 };
}

/** Отделка поверхностей из `colors` / `materials` v1. */
export function migrateFinishes(colors: unknown, materials: unknown): RoomFinishes {
  const c = isObject(colors) ? colors : {};
  const m = isObject(materials) ? materials : {};
  const wall = legacyFinish(c.walls, m.walls, DEFAULT_FINISHES.walls.front);
  return {
    floor: legacyFinish(c.floor, m.floor, { ...DEFAULT_FINISHES.floor, textureId: null }),
    ceiling: legacyFinish(c.ceiling, m.ceiling, DEFAULT_FINISHES.ceiling),
    walls: { front: wall, back: wall, left: wall, right: wall },
  };
}

/** Свет v1 (интенсивности и цвет) → полная конфигурация v2. */
export function migrateLight(raw: unknown): LightConfig {
  const l = isObject(raw) ? raw : {};
  const color = isHexColor(l.color) ? l.color : DEFAULT_LIGHT.color;
  return {
    ...DEFAULT_LIGHT,
    intensity: clamp(num(l.intensity, DEFAULT_LIGHT.intensity), 0, 10),
    ambientIntensity: clamp(num(l.ambientIntensity, DEFAULT_LIGHT.ambientIntensity), 0, 5),
    color,
    colorMode: color.toLowerCase() === '#ffffff' ? 'temperature' : 'color',
  };
}

/** Проём v1: y от середины стены → от пола; у передней стены u зеркалится. */
function migrateOpening(raw: Loose, hostHeight: number, mirrorU: boolean): Opening | null {
  const type = raw.type === 'door' || raw.type === 'window' ? raw.type : null;
  if (!type || !Array.isArray(raw.position)) return null;
  const u = num(raw.position[0], 0);
  const y = num(raw.position[1], 0);
  return {
    id: str(raw.id, '').slice(0, SCENE_LIMITS.idLength) || `${type}_${Math.random().toString(36).slice(2, 10)}`,
    wallId: str(raw.wallId, ''),
    type,
    position: [mirrorU ? -u : u, y + hostHeight / 2],
    width: clamp(num(raw.width, 0.9), 0.1, 10),
    height: clamp(num(raw.height, 1.2), 0.1, 10),
    ...(type === 'door' ? { door: LEGACY_DOOR } : {}),
  };
}

/** Проёмы внешних стен v1 (неизвестные стены отбрасываются). */
export function migrateWallOpenings(raw: unknown, dims: RoomDimensions): Opening[] {
  const list = Array.isArray(raw) ? raw.filter(isObject) : [];
  return list.flatMap((o) => {
    const wallId = str(o.wallId, '');
    if (!isWallSide(wallId)) return [];
    const migrated = migrateOpening(o, dims.height, wallId === 'front');
    const frame = wallFrame(wallId, dims);
    return migrated ? [clampOpening(migrated, { length: frame.length, height: frame.height })] : [];
  });
}

/** Перегородки v1: цвет → отделка, проёмы — в новую систему координат. */
export function migratePartitions(raw: unknown, dims: RoomDimensions): Partition[] {
  const list = Array.isArray(raw) ? raw.filter(isObject).slice(0, SCENE_LIMITS.partitions) : [];
  return list.flatMap((p, index) => {
    const size = tuple3(p.size);
    if (size.some((v) => v <= 0)) return [];
    const id = str(p.id, '').slice(0, SCENE_LIMITS.idLength) || `part_${index}`;
    const openings = (Array.isArray(p.openings) ? p.openings.filter(isObject) : [])
      .map((o) => migrateOpening(o, size[1], false))
      .filter((o): o is Opening => o !== null);
    const color = isHexColor(p.color) ? p.color : null;
    const partition: Partition = {
      id,
      position: tuple3(p.position),
      rotation: [0, tuple3(p.rotation)[1], 0],
      size,
      openings: openings.map((o) => ({ ...o, wallId: id })),
      finish: color ? { textureId: null, color, scale: 1 } : undefined,
      cornerRadius: 0,
      material: legacyPartitionMaterial(size[2]),
    };
    return [clampPartition(partition, dims)];
  });
}

/** Мебель v1: низ на полу, только поворот по вертикали, проверка пути модели. */
export function migrateFurniture(raw: unknown): FurnitureItem[] {
  const list = Array.isArray(raw) ? raw.filter(isObject).slice(0, SCENE_LIMITS.furniture) : [];
  return list.flatMap((f) => {
    if (!modelPathSchema.safeParse(f.modelPath).success) return [];
    const scale = clamp(num(f.scale, 1), 0.05, 20);
    const position = tuple3(f.position);
    const height = typeof f.height === 'number' && f.height > 0 ? f.height : null;
    const bottom = height === null ? 0 : Math.max(0, position[1] - (height / 2) * scale);
    const candidate = {
      ...f,
      name: str(f.name, 'Предмет').slice(0, SCENE_LIMITS.nameLength),
      scale,
      position: [position[0], bottom < 0.02 ? 0 : bottom, position[2]],
      rotation: [0, tuple3(f.rotation)[1], 0],
    };
    const parsed = furnitureSchema.safeParse(candidate);
    return parsed.success ? [parsed.data as FurnitureItem] : [];
  });
}

/**
 * Перевести документ v1 в формат v3 (одна квартира).
 * @param raw - roomData v1 (объект без schemaVersion или со schemaVersion = 1)
 */
export function migrateV1(raw: Loose): SceneDocumentV3 {
  const dimensions = migrateDimensions(raw.dimensions);
  return {
    schemaVersion: 3,
    dimensions,
    outerWalls: DEFAULT_OUTER_WALLS,
    finishes: migrateFinishes(raw.colors, raw.materials),
    removedWalls: [],
    light: migrateLight(raw.light),
    environment: DEFAULT_ENVIRONMENT,
    openings: migrateWallOpenings(raw.openings, dimensions),
    partitions: migratePartitions(raw.partitions, dimensions),
    rooms: [],
    furniture: migrateFurniture(raw.furniture),
  };
}
