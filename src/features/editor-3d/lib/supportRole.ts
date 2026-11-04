/**
 * Роль предмета сцены при расстановке (опора / предмет для поверхности / напольный)
 * с учётом габаритов его модели. Результат кешируется: роль нужна на каждый кадр перетаскивания.
 * @module editor-3d/lib/supportRole
 */

import { placementRole, type PlacementRole } from '@/features/furniture/lib/placementRole';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import type { FurnitureItem } from '@/features/furniture/types';

type RoleItem = Pick<FurnitureItem, 'modelPath' | 'name' | 'halfWidth' | 'halfDepth' | 'height'>;

const CACHE_LIMIT = 2000;
const cache = new Map<string, PlacementRole>();

/** Габариты модели при scale = 1: измеренные у предмета или известные по пути модели. */
function modelSizes(item: RoleItem) {
  if (item.halfWidth && item.halfDepth && item.height) return { halfWidth: item.halfWidth, halfDepth: item.halfDepth, height: item.height };
  return furnitureSizesCache.get(item.modelPath);
}

/**
 * Роль предмета при расстановке.
 * @param item - предмет сцены или черновик из каталога
 */
export function furnitureRole(item: RoleItem): PlacementRole {
  const sizes = modelSizes(item);
  const key = [item.modelPath, item.name, sizes?.halfWidth.toFixed(2), sizes?.halfDepth.toFixed(2), sizes?.height.toFixed(2)].join('|');
  const known = cache.get(key);
  if (known) return known;
  const role = placementRole({ modelPath: item.modelPath, name: item.name, sizes });
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, role);
  return role;
}
