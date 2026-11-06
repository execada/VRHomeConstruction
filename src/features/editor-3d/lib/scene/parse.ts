/**
 * Разбор документа сцены из недоверенного источника (сервер, файл, localStorage).
 * Старые форматы сначала мигрируют (v1 → v3, v2 → v3, v3 → v4 — квартира становится
 * первым этажом). Строгий путь — полная проверка схемы; если не прошла, документ
 * «спасается» по частям: валидные элементы (и этажи) сохраняются, повреждённые отбрасываются.
 * @module editor-3d/lib/scene/parse
 */

import type { z } from 'zod';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { EnvironmentState } from '@/features/environment/types';
import type { FurnitureItem } from '@/features/furniture/types';
import type { OuterWalls, WallSide } from '../../types';
import { DEFAULT_SLAB_THICKNESS, floorName } from '../building/floors';
import { normalizeStair } from '../stairs/stairs';
import { normalizeSupportLinks } from '../supportLinks';
import { isWallSide, WALL_SIDES } from '../walls';
import { createEmptyFloor } from './build';
import { migrateDimensions, migrateV1 } from './migrate';
import { migrateV2 } from './migrateV2';
import { migrateV3 } from './migrateV3';
import {
  finishesSchema,
  floorSchema,
  furnitureSchema,
  lightSchema,
  openingSchema,
  outerWallSchema,
  partitionSchema,
  roomLabelSchema,
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
  sceneDocumentSchema,
  sceneDocumentV3Schema,
  skySchema,
  stairSchema,
  sunSchema,
  type FloorDocument,
  type SceneDocument,
  type SceneDocumentV3,
} from './schema';

/** Результат разбора. */
export type SceneParseResult =
  | { ok: true; doc: SceneDocument; migrated: boolean; dropped: number }
  | { ok: false; error: string };

type Loose = Record<string, unknown>;
/** Содержимое квартиры (документ v3) или этажа без id, названия, смещения и лестниц. */
type Storey = Omit<FloorDocument, 'id' | 'name' | 'offset' | 'stairs'>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Значение, прошедшее схему, или запасное. */
function pick<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

/** Валидные элементы массива (с ограничением длины) и число отброшенных. */
function pickArray<T>(schema: z.ZodType<T>, value: unknown, max: number): { items: T[]; dropped: number } {
  const list = Array.isArray(value) ? value : [];
  const items = list.slice(0, max).flatMap((v) => {
    const parsed = schema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
  return { items, dropped: list.length - items.length };
}

/** Конструкция внешних стен: валидные стороны сохраняются, остальные — по умолчанию. */
function pickOuterWalls(value: unknown, fallback: OuterWalls): OuterWalls {
  const raw = isObject(value) ? value : {};
  return WALL_SIDES.reduce<OuterWalls>((acc, side) => ({ ...acc, [side]: pick(outerWallSchema, raw[side], fallback[side]) }), fallback);
}

/** Солнце и небо: валидные части сохраняются. */
function pickEnvironment(value: unknown): EnvironmentState {
  const env = isObject(value) ? value : {};
  return { sun: pick(sunSchema, env.sun, DEFAULT_ENVIRONMENT.sun), sky: pick(skySchema, env.sky, DEFAULT_ENVIRONMENT.sky) };
}

/** Спасти содержимое квартиры или этажа с повреждёнными частями. */
function salvageStorey(raw: Loose): { storey: Storey; dropped: number } {
  const base = createEmptyFloor(migrateDimensions(raw.dimensions));
  const openings = pickArray(openingSchema, raw.openings, SCENE_LIMITS.openings);
  const partitions = pickArray(partitionSchema, raw.partitions, SCENE_LIMITS.partitions);
  const rooms = pickArray(roomLabelSchema, raw.rooms, SCENE_LIMITS.rooms);
  const furniture = pickArray(furnitureSchema, raw.furniture, SCENE_LIMITS.furniture);
  const removed = (Array.isArray(raw.removedWalls) ? raw.removedWalls : []).filter(
    (s): s is WallSide => typeof s === 'string' && isWallSide(s),
  );
  return {
    storey: {
      dimensions: base.dimensions,
      outerWalls: pickOuterWalls(raw.outerWalls, base.outerWalls),
      finishes: pick(finishesSchema, raw.finishes, base.finishes),
      removedWalls: [...new Set(removed)],
      light: pick(lightSchema, raw.light, base.light),
      openings: openings.items,
      partitions: partitions.items,
      rooms: rooms.items,
      furniture: furniture.items,
    },
    dropped: openings.dropped + partitions.dropped + rooms.dropped + furniture.dropped,
  };
}

/** Спасти этаж документа v4: id и название — если валидны и не повторяются. */
function salvageFloor(raw: unknown, index: number, taken: ReadonlySet<string>): { floor: FloorDocument; dropped: number } {
  const loose = isObject(raw) ? raw : {};
  const parsed = floorSchema.safeParse(raw);
  if (parsed.success && !taken.has(parsed.data.id)) return { floor: parsed.data, dropped: 0 };
  const { storey, dropped } = salvageStorey(loose);
  const stairs = pickArray(stairSchema, loose.stairs, SCENE_LIMITS.stairs);
  const id = floorSchema.shape.id.safeParse(loose.id);
  const name = floorSchema.shape.name.safeParse(loose.name);
  const offset = floorSchema.shape.offset.safeParse(loose.offset);
  const fallbackId = [`floor-${index + 1}`, ...Array.from({ length: SCENE_LIMITS.floors }, (_, i) => `floor-${index + 1}-${i + 1}`)].find((v) => !taken.has(v));
  return {
    floor: {
      id: id.success && !taken.has(id.data) ? id.data : fallbackId ?? `floor-${index + 1}-${taken.size}`,
      name: name.success ? name.data : floorName(index),
      offset: offset.success ? offset.data : [0, 0],
      ...storey,
      stairs: stairs.items,
    },
    dropped: dropped + stairs.dropped,
  };
}

/** Спасти документ v4 по этажам. */
function salvageV4(raw: Loose): { doc: SceneDocument; dropped: number } {
  const list = Array.isArray(raw.floors) ? raw.floors.slice(0, SCENE_LIMITS.floors) : [];
  const { floors, dropped } = list.reduce<{ floors: FloorDocument[]; dropped: number }>(
    (acc, item, index) => {
      const next = salvageFloor(item, index, new Set(acc.floors.map((f) => f.id)));
      return { floors: [...acc.floors, next.floor], dropped: acc.dropped + next.dropped };
    },
    { floors: [], dropped: 0 },
  );
  const slab = sceneDocumentSchema.shape.slabThickness;
  return {
    doc: {
      schemaVersion: SCENE_SCHEMA_VERSION,
      environment: pickEnvironment(raw.environment),
      slabThickness: pick(slab, raw.slabThickness, DEFAULT_SLAB_THICKNESS),
      floors: floors.length > 0 ? floors : [createEmptyFloor()],
    },
    dropped: dropped + Math.max(0, (Array.isArray(raw.floors) ? raw.floors.length : 0) - floors.length),
  };
}

/**
 * Привести этажи к рабочему виду: связи предметов с опорами (опоры нет — предмет на пол,
 * стоящие на верхе опоры предметы получают связь), повороты и ширина лестниц.
 */
function normalize(doc: SceneDocument): SceneDocument {
  return {
    ...doc,
    floors: doc.floors.map((f) => ({ ...f, furniture: normalizeSupportLinks(f.furniture as FurnitureItem[]), stairs: f.stairs.map(normalizeStair) })),
  };
}

/** Документ v3 (строго или со спасением частей) → v4. */
function fromV3(raw: Loose): SceneParseResult {
  const strict = sceneDocumentV3Schema.safeParse(raw);
  if (strict.success) return { ok: true, doc: normalize(migrateV3(strict.data)), migrated: true, dropped: 0 };
  const { storey, dropped } = salvageStorey(raw);
  const doc: SceneDocumentV3 = { schemaVersion: 3, ...storey, environment: pickEnvironment(raw.environment) };
  return { ok: true, doc: normalize(migrateV3(doc)), migrated: true, dropped };
}

/** Документ текущей версии: строго или со спасением этажей. */
function fromV4(raw: Loose): SceneParseResult {
  const strict = sceneDocumentSchema.safeParse(raw);
  if (strict.success) return { ok: true, doc: normalize(strict.data), migrated: false, dropped: 0 };
  const { doc, dropped } = salvageV4(raw);
  return { ok: true, doc: normalize(doc), migrated: false, dropped };
}

/**
 * Разобрать roomData проекта.
 * @param raw - данные из недоверенного источника
 * @returns документ текущей версии (с признаком миграции и числом отброшенных элементов) или ошибка
 */
export function parseSceneDocument(raw: unknown): SceneParseResult {
  if (!isObject(raw)) return { ok: false, error: 'В проекте нет данных комнаты' };
  const version = raw.schemaVersion;
  if (version === undefined || version === 1) return { ok: true, doc: normalize(migrateV3(migrateV1(raw))), migrated: true, dropped: 0 };
  if (version === 2) return fromV3(migrateV2(raw));
  if (version === 3) return fromV3(raw);
  if (version !== SCENE_SCHEMA_VERSION) return { ok: false, error: 'Проект создан в более новой версии приложения — обновите страницу' };
  return fromV4(raw);
}
