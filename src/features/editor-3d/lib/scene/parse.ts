/**
 * Разбор документа сцены из недоверенного источника (сервер, файл, localStorage).
 * Старые форматы сначала мигрируют (v1 → v3, v2 → v3). Строгий путь — полная проверка
 * схемы v3; если не прошла, документ «спасается» по частям: валидные элементы сохраняются,
 * повреждённые отбрасываются.
 * @module editor-3d/lib/scene/parse
 */

import type { z } from 'zod';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { OuterWalls, WallSide } from '../../types';
import { isWallSide, WALL_SIDES } from '../walls';
import { createEmptyScene } from './build';
import { migrateDimensions, migrateV1 } from './migrate';
import { migrateV2 } from './migrateV2';
import {
  finishesSchema,
  furnitureSchema,
  lightSchema,
  openingSchema,
  outerWallSchema,
  partitionSchema,
  roomLabelSchema,
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
  sceneDocumentSchema,
  skySchema,
  sunSchema,
  type SceneDocument,
} from './schema';

/** Результат разбора. */
export type SceneParseResult =
  | { ok: true; doc: SceneDocument; migrated: boolean; dropped: number }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

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

/** Спасти документ текущей версии с повреждёнными частями. */
function salvage(raw: Record<string, unknown>): { doc: SceneDocument; dropped: number } {
  const base = createEmptyScene(migrateDimensions(raw.dimensions));
  const env = isObject(raw.environment) ? raw.environment : {};
  const openings = pickArray(openingSchema, raw.openings, SCENE_LIMITS.openings);
  const partitions = pickArray(partitionSchema, raw.partitions, SCENE_LIMITS.partitions);
  const rooms = pickArray(roomLabelSchema, raw.rooms, SCENE_LIMITS.rooms);
  const furniture = pickArray(furnitureSchema, raw.furniture, SCENE_LIMITS.furniture);
  const removed = (Array.isArray(raw.removedWalls) ? raw.removedWalls : []).filter(
    (s): s is WallSide => typeof s === 'string' && isWallSide(s),
  );
  return {
    doc: {
      ...base,
      outerWalls: pickOuterWalls(raw.outerWalls, base.outerWalls),
      finishes: pick(finishesSchema, raw.finishes, base.finishes),
      removedWalls: [...new Set(removed)],
      light: pick(lightSchema, raw.light, base.light),
      environment: {
        sun: pick(sunSchema, env.sun, DEFAULT_ENVIRONMENT.sun),
        sky: pick(skySchema, env.sky, DEFAULT_ENVIRONMENT.sky),
      },
      openings: openings.items,
      partitions: partitions.items,
      rooms: rooms.items,
      furniture: furniture.items,
    },
    dropped: openings.dropped + partitions.dropped + rooms.dropped + furniture.dropped,
  };
}

/** Проверить документ текущей версии: строго или со спасением частей. */
function validate(raw: Record<string, unknown>, migrated: boolean): SceneParseResult {
  const strict = sceneDocumentSchema.safeParse(raw);
  if (strict.success) return { ok: true, doc: strict.data, migrated, dropped: 0 };
  const { doc, dropped } = salvage(raw);
  return { ok: true, doc, migrated, dropped };
}

/**
 * Разобрать roomData проекта.
 * @param raw - данные из недоверенного источника
 * @returns документ текущей версии (с признаком миграции и числом отброшенных элементов) или ошибка
 */
export function parseSceneDocument(raw: unknown): SceneParseResult {
  if (!isObject(raw)) return { ok: false, error: 'В проекте нет данных комнаты' };

  if (raw.schemaVersion === undefined || raw.schemaVersion === 1) {
    return { ok: true, doc: migrateV1(raw), migrated: true, dropped: 0 };
  }
  if (raw.schemaVersion === 2) return validate(migrateV2(raw), true);
  if (raw.schemaVersion !== SCENE_SCHEMA_VERSION) {
    return { ok: false, error: 'Проект создан в более новой версии приложения — обновите страницу' };
  }
  return validate(raw, false);
}
