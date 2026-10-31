/**
 * Разбор документа сцены из недоверенного источника (сервер, файл, localStorage).
 * Строгий путь — полная проверка схемы v2; если не прошла, документ «спасается»
 * по частям: валидные элементы сохраняются, повреждённые отбрасываются.
 * @module editor-3d/lib/scene/parse
 */

import type { z } from 'zod';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { WallSide } from '../../types';
import { isWallSide } from '../walls';
import { createEmptyScene } from './build';
import { migrateDimensions, migrateV1 } from './migrate';
import {
  finishesSchema,
  furnitureSchema,
  lightSchema,
  openingSchema,
  partitionSchema,
  SCENE_LIMITS,
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

/** Спасти документ v2 с повреждёнными частями. */
function salvageV2(raw: Record<string, unknown>): { doc: SceneDocument; dropped: number } {
  const base = createEmptyScene(migrateDimensions(raw.dimensions));
  const env = isObject(raw.environment) ? raw.environment : {};
  const openings = pickArray(openingSchema, raw.openings, SCENE_LIMITS.openings);
  const partitions = pickArray(partitionSchema, raw.partitions, SCENE_LIMITS.partitions);
  const furniture = pickArray(furnitureSchema, raw.furniture, SCENE_LIMITS.furniture);
  const thickness = typeof raw.wallThickness === 'number' ? raw.wallThickness : base.wallThickness;
  const removed = (Array.isArray(raw.removedWalls) ? raw.removedWalls : []).filter(
    (s): s is WallSide => typeof s === 'string' && isWallSide(s),
  );
  return {
    doc: {
      ...base,
      wallThickness: Math.min(SCENE_LIMITS.wallThickness[1], Math.max(SCENE_LIMITS.wallThickness[0], thickness)),
      finishes: pick(finishesSchema, raw.finishes, base.finishes),
      removedWalls: [...new Set(removed)],
      light: pick(lightSchema, raw.light, base.light),
      environment: {
        sun: pick(sunSchema, env.sun, DEFAULT_ENVIRONMENT.sun),
        sky: pick(skySchema, env.sky, DEFAULT_ENVIRONMENT.sky),
      },
      openings: openings.items,
      partitions: partitions.items,
      furniture: furniture.items,
    },
    dropped: openings.dropped + partitions.dropped + furniture.dropped,
  };
}

/**
 * Разобрать roomData проекта.
 * @param raw - данные из недоверенного источника
 * @returns документ v2 (с признаком миграции и числом отброшенных элементов) или ошибка
 */
export function parseSceneDocument(raw: unknown): SceneParseResult {
  if (!isObject(raw)) return { ok: false, error: 'В проекте нет данных комнаты' };

  if (raw.schemaVersion === undefined || raw.schemaVersion === 1) {
    return { ok: true, doc: migrateV1(raw), migrated: true, dropped: 0 };
  }
  if (raw.schemaVersion !== 2) {
    return { ok: false, error: 'Проект создан в более новой версии приложения — обновите страницу' };
  }

  const strict = sceneDocumentSchema.safeParse(raw);
  if (strict.success) return { ok: true, doc: strict.data, migrated: false, dropped: 0 };

  const { doc, dropped } = salvageV2(raw);
  return { ok: true, doc, migrated: false, dropped };
}
