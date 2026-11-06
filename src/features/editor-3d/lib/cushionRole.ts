/**
 * Подушки и посадочные места предметов сцены: подушка ли предмет (и как садится), какие места
 * у дивана или кресла — по манифесту каталога или, для своих моделей, по названию и габаритам.
 * @module editor-3d/lib/cushionRole
 */

import { cushionSockets, cushionStyle, type CushionSocket, type CushionStyle } from '@/features/furniture/lib/cushions';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import type { FurnitureItem } from '@/features/furniture/types';

type RoleItem = Pick<FurnitureItem, 'modelPath' | 'name' | 'halfWidth' | 'halfDepth' | 'height'>;

/** Габариты модели при scale = 1: измеренные у предмета или известные по пути. */
function modelSizes(item: RoleItem) {
  if (item.halfWidth && item.halfDepth && item.height) return { halfWidth: item.halfWidth, halfDepth: item.halfDepth, height: item.height };
  return furnitureSizesCache.get(item.modelPath);
}

/** Посадочные места предмета (пусто — у модели их нет). */
export function socketsOf(item: RoleItem): CushionSocket[] {
  return cushionSockets({ modelPath: item.modelPath, name: item.name, sizes: modelSizes(item) });
}

/** Подушка ли предмет и как садится (null — не подушка). */
export function cushionOf(item: Pick<FurnitureItem, 'modelPath' | 'name'>): CushionStyle | null {
  return cushionStyle({ modelPath: item.modelPath, name: item.name });
}
