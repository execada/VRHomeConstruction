/**
 * Схема документа сцены v4 (Zod). Используется при загрузке проекта с сервера,
 * импорте файла, восстановлении локальной копии и перед сохранением.
 * Ограничения согласованы с бэкендом (размеры этажа, длины массивов и строк).
 *
 * v4 по сравнению с v3: здание из этажей (`floors`, снизу вверх) — у каждого этажа свои
 * размеры и смещение, внешние и внутренние стены, проёмы и двери, помещения, лестницы
 * (`stairs`), свет и мебель; толщина перекрытия между этажами (`slabThickness`).
 * Окружение (солнце, небо) — общее. Документ v3 — это один этаж (схема `sceneDocumentV3Schema`).
 *
 * v3 по сравнению с v2: у каждой внешней стены своя толщина и материал (`outerWalls`
 * вместо общего `wallThickness`), у внутренних стен (перегородок) — материал; названия
 * и виды помещений (`rooms`: помещения вычисляются по стенам, подпись привязана к точке);
 * двери как объекты в дверных проёмах (`door`: модель, петли, сторона открывания, открыта ли).
 * @module editor-3d/lib/scene/schema
 */

import { z } from 'zod';
import { DOOR_STYLE_IDS } from '../doors';
import { FLOOR_NAME_LENGTH, MAX_FLOORS, SLAB_THICKNESS_LIMITS } from '../building/floors';
import { STAIR_WIDTH_LIMITS } from '../stairs/stairs';
import { WALL_MATERIAL_IDS } from '../wallMaterials';

/** Текущая версия формата документа сцены. */
export const SCENE_SCHEMA_VERSION = 4;
/** Версия документа «одна квартира» (до этажей). */
const SINGLE_FLOOR_VERSION = 3;

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
  floors: MAX_FLOORS,
  stairs: 8,
  floorNameLength: FLOOR_NAME_LENGTH,
  slabThickness: SLAB_THICKNESS_LIMITS,
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
  /** Опора, на поверхности которой стоит предмет (необязательное поле: старые документы v2 валидны) */
  supportId: id.optional(),
  /** Посадочное место дивана или кресла, в котором сидит подушка */
  socket: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/).optional(),
  /** Где висит предмет: грань стены (`front`, `${перегородка}:a`) или `ceiling` */
  mount: z.string().regex(/^[\w-]{1,64}(:[ab])?$/).optional(),
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

export const stairSchema = z.object({
  id,
  kind: z.enum(['straight', 'landing']),
  position: z.tuple([coordinate, coordinate]),
  /** Кратен 90° (приводится при загрузке) */
  rotation: z.number().min(-2 * Math.PI - 0.01).max(2 * Math.PI + 0.01),
  width: z.number().min(STAIR_WIDTH_LIMITS[0]).max(STAIR_WIDTH_LIMITS[1]),
});

const environmentSchema = z.object({ sun: sunSchema, sky: skySchema });

/** Содержимое одного этажа (оно же — квартира документа v3). */
const storeyShape = {
  dimensions: dimensionsSchema,
  outerWalls: outerWallsSchema,
  finishes: finishesSchema,
  removedWalls: z.array(wallSide).max(4),
  light: lightSchema,
  openings: z.array(openingSchema).max(SCENE_LIMITS.openings),
  partitions: z.array(partitionSchema).max(SCENE_LIMITS.partitions),
  rooms: z.array(roomLabelSchema).max(SCENE_LIMITS.rooms).default([]),
  furniture: z.array(furnitureSchema).max(SCENE_LIMITS.furniture),
};

/** Документ v3: одна квартира (старые проекты мигрируют в один этаж). */
export const sceneDocumentV3Schema = z.object({
  schemaVersion: z.literal(SINGLE_FLOOR_VERSION),
  ...storeyShape,
  environment: environmentSchema,
});

export const floorSchema = z.object({
  id,
  name: z.string().trim().min(1).max(SCENE_LIMITS.floorNameLength),
  offset: z.tuple([coordinate, coordinate]),
  ...storeyShape,
  stairs: z.array(stairSchema).max(SCENE_LIMITS.stairs).default([]),
});

export const sceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
    environment: environmentSchema,
    slabThickness: z.number().min(SCENE_LIMITS.slabThickness[0]).max(SCENE_LIMITS.slabThickness[1]),
    floors: z.array(floorSchema).min(1).max(SCENE_LIMITS.floors),
  })
  .refine((doc) => new Set(doc.floors.map((f) => f.id)).size === doc.floors.length, 'Повторяющиеся id этажей');

/** Документ сцены v4 — то, что сохраняется в `roomData` проекта. */
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
/** Этаж документа сцены. */
export type FloorDocument = z.infer<typeof floorSchema>;
/** Документ сцены v3 (одна квартира). */
export type SceneDocumentV3 = z.infer<typeof sceneDocumentV3Schema>;
