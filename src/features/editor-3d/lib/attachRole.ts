/**
 * Тип крепления предметов сцены (пол, стена, потолок, поверхность) с учётом габаритов модели.
 * Результат кешируется: тип нужен на каждый кадр перетаскивания и размещения.
 * @module editor-3d/lib/attachRole
 */

import { attachType, type AttachType } from '@/features/furniture/lib/attachType';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import type { FurnitureItem } from '@/features/furniture/types';

type RoleItem = Pick<FurnitureItem, 'modelPath' | 'name' | 'halfWidth' | 'halfDepth' | 'height'>;

const CACHE_LIMIT = 2000;
const cache = new Map<string, AttachType>();

/** Габариты модели при scale = 1: измеренные у предмета или известные по пути модели. */
function modelSizes(item: RoleItem) {
  if (item.halfWidth && item.halfDepth && item.height) return { halfWidth: item.halfWidth, halfDepth: item.halfDepth, height: item.height };
  return furnitureSizesCache.get(item.modelPath);
}

/**
 * Тип крепления предмета.
 * @param item - предмет сцены или черновик из каталога
 */
export function attachOf(item: RoleItem): AttachType {
  const sizes = modelSizes(item);
  const key = [item.modelPath, item.name, sizes?.halfWidth.toFixed(2), sizes?.halfDepth.toFixed(2), sizes?.height.toFixed(2)].join('|');
  const known = cache.get(key);
  if (known) return known;
  const attach = attachType({ modelPath: item.modelPath, name: item.name, sizes });
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, attach);
  return attach;
}

/** Висит ли предмет на стене или под потолком. */
export function isMounted(item: RoleItem): boolean {
  const attach = attachOf(item);
  return attach === 'wall' || attach === 'ceiling';
}
