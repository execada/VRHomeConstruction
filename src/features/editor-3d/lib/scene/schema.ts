/**
 * Схема документа сцены v3 (Zod). Используется при загрузке проекта с сервера,
 * импорте файла, восстановлении локальной копии и перед сохранением.
 * Ограничения согласованы с бэкендом (размеры комнаты, длины массивов и строк).
 *
 * v3 по сравнению с v2: у каждой внешней стены своя толщина и материал (`outerWalls`
 * вместо общего `wallThickness`), у внутренних стен (перегородок) — материал; названия
 * и виды помещений (`rooms`: помещения вычисляются по стенам, подпись привязана к точке);
 * двери как объекты в дверных проёмах (`door`: модель, петли, сторона открывания, открыта ли).
 * @module editor-3d/lib/scene/schema
 */

import { z } from 'zod';
import { DOOR_STYLE_IDS } from '../doors';
import { WALL_MATERIAL_IDS } from '../wallMaterials';

/** Текущая версия формата документа сцены. */
export const SCENE_SCHEMA_VERSION = 3;

/** Лимиты документа (совпадают с проверками бэкенда). */
export const SCENE_LIMITS = {
  width: [1, 50],
  depth: [1, 50],
  height: [1.5, 10],
  wallThickness: [0.05, 0.6],
  coordinate: 100,
  furniture: 500,
  partitions: 100,
  openings: 300,
  partitionOpenings: 20,
  rooms: 100,
  roomNameLength: 60,
  idLength: 64,
  nameLength: 120,
  pathLength: 512,
} as const;

const id = z.string().min(1).max(SCENE_LIMITS.idLength);
const coordinate = z.number().min(-SCENE_LIMITS.coordinate).max(SCENE_LIMITS.coordinate);
const vec3 = z.tuple([coordinate, coordinate, coordinate]);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const textureId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/);
const wallSide = z.enum(['front', 'back', 'left', 'right']);
const wallMaterialId = z.enum(WALL_MATERIAL_IDS);

/**
 * Путь к модели: процедурная (`primitive:sofa`) или файл того же origin
 * (`/models/…` или `/assets/…`, только .glb/.gltf, без `..` и `//`). Внешние URL запрещены:
 * импортированный файл не должен заставлять браузер грузить что-то со сторонних серверов.
 * %-кодирование не допускается: браузер раскрыл бы %2e%2e в «..».
 */
export const modelPathSchema = z
  .string()
  .max(SCENE_LIMITS.pathLength)
  .refine(
    (p) =>
      /^primitive:[a-z0-9_]{1,40}$/.test(p) ||
      (/^\/(models|assets)\/[\w\-./ ()]+\.(glb|gltf)$/i.test(p) && !p.includes('..') && !p.includes('//')),
    'Недопустимый путь к модели',
  );

export const dimensionsSchema = z.object({
  width: z.number().min(SCENE_LIMITS.width[0]).max(SCENE_LIMITS.width[1]),
  height: z.number().min(SCENE_LIMITS.height[0]).max(SCENE_LIMITS.height[1]),
  depth: z.number().min(SCENE_LIMITS.depth[0]).max(SCENE_LIMITS.depth[1]),
});

export const finishSchema = z.object({
  textureId: textureId.nullable(),
  color: hexColorSchema,
  scale: z.number().min(0.1).max(10),
});

export const finishesSchema = z.object({
  floor: finishSchema,
  ceiling: finishSchema,
  walls: z.object({ front: finishSchema, back: finishSchema, left: finishSchema, right: finishSchema }),
});

export const doorSchema = z.object({
  style: z.enum(DOOR_STYLE_IDS),
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['front', 'back']),
  open: z.boolean(),
  color: hexColorSchema,
});

export const openingSchema = z.object({
  id,
  wallId: id,
  type: z.enum(['window', 'door']),
  position: z.tuple([coordinate, coordinate]),
  /** До длины стены: панорамное остекление */
  width: z.number().positive().max(SCENE_LIMITS.width[1]),
  height: z.number().positive().max(SCENE_LIMITS.height[1]),
  door: doorSchema.optional(),
});

export const partitionSchema = z.object({
  id,
  position: vec3,
  rotation: vec3,
  size: z.tuple([z.number().positive().max(50), z.number().positive().max(10), z.number().positive().max(1)]),
  openings: z.array(openingSchema).max(SCENE_LIMITS.partitionOpenings),
  finish: finishSchema.optional(),
  cornerRadius: z.number().min(0).max(0.5).optional(),
  material: wallMaterialId.optional(),
});

export const outerWallSchema = z.object({
  thickness: z.number().min(SCENE_LIMITS.wallThickness[0]).max(SCENE_LIMITS.wallThickness[1]),
  material: wallMaterialId,
});

export const outerWallsSchema = z.object({ front: outerWallSchema, back: outerWallSchema, left: outerWallSchema, right: outerWallSchema });

export const roomLabelSchema = z.object({
  id,
  name: z.string().min(1).max(SCENE_LIMITS.roomNameLength),
  anchor: z.tuple([coordinate, coordinate]),
  kind: z.enum(['room', 'loggia', 'balcony']).optional(),
});

export const furnitureSchema = z.object({
  id,
  name: z.string().max(SCENE_LIMITS.nameLength),
  modelPath: modelPathSchema,
  position: vec3,
  scale: z.number().positive().max(20),
  rotation: vec3,
  halfWidth: z.number().positive().max(50).optional(),
  halfDepth: z.number().positive().max(50).optional(),
  height: z.number().positive().max(20).optional(),
  locked: z.boolean().optional(),
  color: hexColorSchema.nullable().optional(),
});

export const lightSchema = z.object({
  intensity: z.number().min(0).max(10),
  ambientIntensity: z.number().min(0).max(5),
  color: hexColorSchema,
  enabled: z.boolean(),
  temperature: z.number().min(1000).max(12000),
  colorMode: z.enum(['temperature', 'color']),
  shadows: z.boolean(),
});

export const sunSchema = z.object({
  enabled: z.boolean(),
  side: z.enum(['front', 'back']),
  timeOfDay: z.number().min(0).max(24),
  intensity: z.number().min(0).max(10),
  shadows: z.boolean(),
});

export const skySchema = z.object({
  mode: z.enum(['hdri', 'sky', 'color']),
  hdriId: textureId.nullable(),
  color: hexColorSchema,
  rotation: z.number().min(-360).max(360),
  exposure: z.number().min(0).max(4),
});

export const sceneDocumentSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  dimensions: dimensionsSchema,
  outerWalls: outerWallsSchema,
  finishes: finishesSchema,
  removedWalls: z.array(wallSide).max(4),
  light: lightSchema,
  environment: z.object({ sun: sunSchema, sky: skySchema }),
  openings: z.array(openingSchema).max(SCENE_LIMITS.openings),
  partitions: z.array(partitionSchema).max(SCENE_LIMITS.partitions),
  rooms: z.array(roomLabelSchema).max(SCENE_LIMITS.rooms).default([]),
  furniture: z.array(furnitureSchema).max(SCENE_LIMITS.furniture),
});

/** Документ сцены v3 — то, что сохраняется в `roomData` проекта. */
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
