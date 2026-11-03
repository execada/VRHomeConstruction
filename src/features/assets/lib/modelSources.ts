/**
 * Конвейер моделей (scripts/models/sync-models.mjs): описание источников, разбор ответа
 * Poly Haven, сборка записей манифеста и текста лицензий. Чистые функции без ввода-вывода —
 * сеть и файлы остаются в скрипте, а здесь всё проверяется тестами.
 * @module assets/lib/modelSources
 */

import { z } from 'zod';
import { modelCategorySchema, normalizeRuleSchema, type ModelEntry } from './manifest';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
const LICENSE_URLS: Record<string, string> = {
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};
const LICENSE_LABELS: Record<string, string> = { 'CC0': 'CC0 1.0', 'CC-BY 4.0': 'CC BY 4.0' };
const POLYHAVEN_DOWNLOADS = 'https://dl.polyhaven.org/';

const isCcBy = (license: string) => license.startsWith('CC-BY');

const common = {
  id,
  label: z.string().min(1).max(80),
  category: modelCategorySchema,
  normalize: normalizeRuleSchema.optional(),
};

const creditSchema = z
  .object({
    author: z.string().min(1).max(200),
    license: z.enum(['CC0', 'CC-BY 4.0']),
    /** Страница источника или путь к генератору в репозитории */
    url: z.string().min(1).max(300),
    /** Полная строка атрибуции (обязательна для CC BY) */
    attribution: z.string().max(400).optional(),
    /** Что изменено относительно оригинала */
    changes: z.string().max(300).optional(),
  })
  .refine((c) => !isCcBy(c.license) || Boolean(c.attribution), 'Для CC BY нужна строка атрибуции');

/** Источник модели: Poly Haven (скачивается по API) или локальная папка с готовым glTF. */
export const modelSourceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('polyhaven'), ...common }),
  z.object({
    source: z.literal('local'),
    ...common,
    file: z.string().regex(/^[\w-]+(\.[\w-]+)*\.(gltf|glb)$/),
    credit: creditSchema,
  }),
]);

export type ModelSource = z.infer<typeof modelSourceSchema>;

/**
 * Разобрать конфигурацию конвейера.
 * @throws Error с перечнем ошибок или повторяющихся id
 */
export function parseModelsConfig(raw: unknown): ModelSource[] {
  const parsed = z.object({ models: z.array(modelSourceSchema) }).safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const seen = new Set<string>();
  parsed.data.models.forEach((m) => {
    if (seen.has(m.id)) throw new Error(`Модель ${m.id} описана дважды`);
    seen.add(m.id);
  });
  return parsed.data.models;
}

const safePath = z
  .string()
  .regex(/^[\w-]+(\/[\w-]+)*\.[\w]+$/)
  .refine((p) => !p.includes('..'));
const remoteFile = z.object({
  url: z.string().startsWith(POLYHAVEN_DOWNLOADS),
  md5: z.string().regex(/^[a-f0-9]{32}$/),
  size: z.number().int().nonnegative(),
});

/** Файл для скачивания с Poly Haven. */
export interface RemoteFile {
  /** Путь внутри папки модели */
  path: string;
  url: string;
  md5: string;
  size: number;
  /** Главный .gltf */
  main: boolean;
}

/**
 * Файлы glTF нужного разрешения из ответа `GET /files/<id>`.
 * @throws Error, если разрешения нет или ответ содержит чужие адреса и небезопасные пути
 */
export function pickPolyhavenFiles(files: unknown, resolution = '1k'): RemoteFile[] {
  const schema = z.object({
    gltf: z.record(z.string(), z.object({ gltf: remoteFile.extend({ include: z.record(safePath, remoteFile) }) })),
  });
  const parsed = schema.safeParse(files);
  const gltf = parsed.success ? parsed.data.gltf[resolution]?.gltf : undefined;
  if (!gltf) throw new Error(`Нет glTF ${resolution} или ответ Poly Haven не прошёл проверку`);
  const mainPath = safePath.parse(gltf.url.split('/').pop());
  return [
    { path: mainPath, url: gltf.url, md5: gltf.md5, size: gltf.size, main: true },
    ...Object.entries(gltf.include).map(([path, f]) => ({ path, url: f.url, md5: f.md5, size: f.size, main: false })),
  ];
}

/** Авторы из ответа `GET /info/<id>`. */
export function polyhavenAuthors(info: { authors?: Record<string, string> }): string {
  return Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven';
}

/** Габариты в метрах с точностью до миллиметра (не меньше 1 мм). */
export function roundedDimensions(size: { x: number; y: number; z: number }): NonNullable<ModelEntry['dimensions']> {
  const mm = (v: number) => Math.max(0.001, Math.round(v * 1000) / 1000);
  return { width: mm(size.x), height: mm(size.y), depth: mm(size.z) };
}

/** Измеренные свойства модели. */
export interface MeasuredModel {
  /** Автор (для Poly Haven — из API) */
  author: string;
  file: string;
  thumbnail: string;
  sizeBytes: number;
  triangles: number;
  /** Габариты после нормализации, м */
  size: { x: number; y: number; z: number };
}

/** Запись манифеста для источника и результатов измерения. */
export function buildModelEntry(source: ModelSource, measured: MeasuredModel): ModelEntry {
  const credit =
    source.source === 'polyhaven'
      ? { source: `https://polyhaven.com/a/${source.id}`, license: 'CC0', author: measured.author }
      : { source: source.credit.url, license: source.credit.license, author: source.credit.author };
  return {
    id: source.id,
    label: source.label,
    category: source.category,
    file: measured.file,
    thumbnail: measured.thumbnail,
    sizeBytes: measured.sizeBytes,
    dimensions: roundedDimensions(measured.size),
    triangles: measured.triangles,
    ...(source.normalize ? { normalize: source.normalize } : {}),
    ...credit,
  };
}

/** Строки таблицы LICENSES.md для моделей. */
export function renderLicenseRows(entries: Array<Pick<ModelEntry, 'id' | 'author' | 'source' | 'license'>>): string {
  return entries
    .map((e) => `| ${e.id} | 3D model (glTF) | ${e.author} | ${e.source} | ${LICENSE_LABELS[e.license] ?? e.license} |`)
    .join('\n');
}

/** Текстура материалов процедурных моделей (scripts/models/build-procedural.mjs → _textures/credits.json). */
export const textureCreditSchema = z.object({
  id,
  author: z.string().min(1).max(200),
  source: z.string().url().max(300),
  license: z.literal('CC0'),
});

/** Строки таблицы LICENSES.md для текстур материалов (повреждённые записи пропускаются). */
export function renderTextureRows(credits: unknown): string {
  const list = Array.isArray(credits) ? credits.flatMap((c) => (textureCreditSchema.safeParse(c).success ? [c as z.infer<typeof textureCreditSchema>] : [])) : [];
  return list.map((c) => `| ${c.id} | PBR texture (model material) | ${c.author} | ${c.source} | CC0 1.0 |`).join('\n');
}

/** Полные атрибуции моделей под CC BY (для LICENSES.md, по-английски, как весь файл). */
export function renderAttributions(sources: ModelSource[]): string {
  const lines = sources.flatMap((s) => {
    if (s.source !== 'local' || !isCcBy(s.credit.license)) return [];
    const changes = s.credit.changes ? ` Changes: ${s.credit.changes}.` : '';
    const license = `[${LICENSE_LABELS[s.credit.license]}](${LICENSE_URLS[s.credit.license]})`;
    return [`- \`${s.id}\`: ${s.credit.attribution}. Source: ${s.credit.url}. License: ${license}.${changes}`];
  });
  return lines.length > 0 ? lines.join('\n') : 'No CC BY models.';
}

/**
 * Заменить текст между маркерами (сами маркеры остаются).
 * @throws Error, если маркеров нет
 */
export function replaceBetweenMarkers(text: string, start: string, end: string, content: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Не найдены маркеры ${start} … ${end}`);
  return `${text.slice(0, from + start.length)}\n${content}\n${text.slice(to)}`;
}
