/**
 * Профили моделей каталога из манифеста ассетов (вшит в сборку): категория, поправки
 * нормализации и реальные габариты. Доступны синхронно, ещё до загрузки манифеста по сети,
 * поэтому шаблоны и размещение точны сразу, а модель нормализуется с первого кадра.
 * @module furniture/lib/modelProfiles
 */

import manifestJson from '../../../../public/assets/manifest.json';
import { parseManifest, type ModelEntry } from '@/features/assets/lib/manifest';
import type { ModelSizes } from './modelLook';

/** Сведения о модели каталога. */
export type ModelProfile = Pick<ModelEntry, 'category' | 'normalize' | 'dimensions'>;

const BUNDLED = parseManifest(manifestJson).models;

/** Профили по пути модели. */
export const MODEL_PROFILES: ReadonlyMap<string, ModelProfile> = new Map(
  BUNDLED.map((m) => [m.file, { category: m.category, normalize: m.normalize, dimensions: m.dimensions }]),
);

/** Профиль модели каталога (undefined — пользовательская или неизвестная модель). */
export function modelProfile(path: string): ModelProfile | undefined {
  return MODEL_PROFILES.get(path);
}

/**
 * Габариты для размещения (половины ширины и глубины, высота) по реальным размерам манифеста.
 * @param entries - записи манифеста
 */
export function profileSizes(entries: ReadonlyArray<Pick<ModelEntry, 'file' | 'category' | 'dimensions'>>): Record<string, ModelSizes> {
  return Object.fromEntries(
    entries.flatMap((m) =>
      m.dimensions
        ? [[m.file, { halfWidth: m.dimensions.width / 2, halfDepth: m.dimensions.depth / 2, height: m.dimensions.height }]]
        : [],
    ),
  );
}

/** Габариты всех моделей манифеста. */
export const MANIFEST_MODEL_SIZES: Readonly<Record<string, ModelSizes>> = profileSizes(BUNDLED);
