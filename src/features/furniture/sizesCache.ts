/**
 * Кеш размеров моделей.
 * Позволяет повторно использовать измеренные размеры без повторной загрузки модели;
 * для моделей каталога заранее известны габариты (см. knownSizes).
 * @module furniture/sizesCache
 */

import { KNOWN_MODEL_SIZES } from './lib/knownSizes';

interface FurnitureSizes {
  halfWidth: number;
  halfDepth: number;
  height: number;
}

const cache = new Map<string, FurnitureSizes>();

export const furnitureSizesCache = {
  /** Получить размеры модели по пути к файлу */
  get: (path: string): FurnitureSizes | undefined => cache.get(path) ?? KNOWN_MODEL_SIZES[path],
  /** Сохранить размеры модели */
  set: (path: string, sizes: FurnitureSizes) => {
    cache.set(path, sizes);
  },
};
