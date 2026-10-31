/**
 * Предзагрузка моделей мебели (наведение на карточку каталога — модель уже в кэше к клику).
 * @module furniture/lib/preload
 */

import { useGLTF } from '@react-three/drei';

/** Префикс путей процедурной мебели (без файла модели). */
export const PRIMITIVE_PREFIX = 'primitive:';

/** Начать загрузку модели заранее. */
export function preloadModel(path: string): void {
  if (!path.startsWith(PRIMITIVE_PREFIX)) useGLTF.preload(path);
}
