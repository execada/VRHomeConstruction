/**
 * Манифест ассетов (`/assets/manifest.json`): HDRI-пейзажи, PBR-текстуры и 3D-модели.
 * Файл статический, но проверяется как недоверенные данные: каждая запись валидируется
 * отдельно, пути разрешены только внутри `/assets/`.
 * @module assets/lib/manifest
 */

import { z } from 'zod';

// Только латиница, цифры, «_», «-», «.» и «/»: без %-кодирования (браузер раскрыл бы
// %2e%2e в «..»), обратных слэшей и «//» — путь не выйдет за пределы /assets/.
const assetPath = z
  .string()
  .max(300)
  .regex(/^\/assets\/[\w\-./]+$/)
  .refine((p) => !p.includes('..') && !p.includes('//'), 'Недопустимый путь');

const credit = {
  source: z.string().max(300),
  license: z.string().max(40),
  author: z.string().max(200),
};

const entryId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);

export const hdriEntrySchema = z.object({
  id: entryId,
  label: z.string().max(80),
  file: assetPath.refine((p) => p.endsWith('.hdr'), 'Ожидается .hdr'),
  thumbnail: assetPath,
  ...credit,
});

export const textureCategorySchema = z.enum(['floor', 'wall', 'ceiling']);

export const textureEntrySchema = z.object({
  id: entryId,
  label: z.string().max(80),
  category: textureCategorySchema,
  tileMeters: z.number().min(0.05).max(20),
  maps: z.object({
    color: assetPath,
    normal: assetPath.optional(),
    roughness: assetPath.optional(),
    arm: assetPath.optional(),
  }),
  thumbnail: assetPath,
  ...credit,
});

export const modelCategorySchema = z.enum([
  'seating',
  'tables',
  'storage',
  'lighting',
  'decor',
  'plants',
  'bedroom',
  'kitchen',
]);

export const modelEntrySchema = z.object({
  id: entryId,
  label: z.string().max(80),
  category: modelCategorySchema,
  file: assetPath.refine((p) => /\.(gltf|glb)$/i.test(p), 'Ожидается .gltf/.glb'),
  thumbnail: assetPath,
  sizeBytes: z.number().int().nonnegative(),
  ...credit,
});

export type HdriEntry = z.infer<typeof hdriEntrySchema>;
export type TextureEntry = z.infer<typeof textureEntrySchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type ModelCategory = z.infer<typeof modelCategorySchema>;

/** Проверенный манифест. */
export interface AssetManifest {
  hdris: HdriEntry[];
  textures: TextureEntry[];
  models: ModelEntry[];
}

export const EMPTY_MANIFEST: AssetManifest = { hdris: [], textures: [], models: [] };

/** Валидные записи списка (повреждённые пропускаются). */
function validEntries<T>(schema: z.ZodType<T>, value: unknown, max: number): T[] {
  return (Array.isArray(value) ? value.slice(0, max) : []).flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Разобрать манифест.
 * @param raw - содержимое manifest.json
 * @returns проверенный манифест (пустой, если формат не распознан)
 */
export function parseManifest(raw: unknown): AssetManifest {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return EMPTY_MANIFEST;
  const data = raw as Record<string, unknown>;
  return {
    hdris: validEntries(hdriEntrySchema, data.hdris, 50),
    textures: validEntries(textureEntrySchema, data.textures, 300),
    models: validEntries(modelEntrySchema, data.models, 500),
  };
}

const MANIFEST_URL = '/assets/manifest.json';
const TIMEOUT_MS = 15000;

/**
 * Загрузить манифест с сервера.
 * @throws Error с понятным текстом при сетевой ошибке или неверном ответе
 */
export async function fetchManifest(): Promise<AssetManifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MANIFEST_URL, { signal: controller.signal, headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (!res.ok) throw new Error(`Каталог ассетов недоступен (HTTP ${res.status})`);
    return parseManifest(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
