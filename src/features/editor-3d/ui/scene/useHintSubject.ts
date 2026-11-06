/**
 * Предмет, для которого сцена показывает подсказки размещения (поверхности опор, посадочные
 * места): модель из каталога, которую сейчас размещают (черновик), или перетаскиваемый предмет.
 * @module editor-3d/ui/scene/useHintSubject
 */

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { interactionStore } from '../../model/interactionStore';

/** id черновика размещаемой модели. */
export const DRAFT_ID = '__hint__';

export function useHintSubject(): FurnitureItem | null {
  const mode = useExternalStore(interactionStore, (s) => s.mode);
  const path = useExternalStore(interactionStore, (s) => s.placingPath);
  const name = useExternalStore(interactionStore, (s) => s.placingName);
  const activeId = useExternalStore(interactionStore, (s) => s.activeId);
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  return useMemo(() => {
    if (mode === 'dragging' && activeId) return items.find((i) => i.id === activeId) ?? null;
    if (mode !== 'placing' || !path) return null;
    const sizes = furnitureSizesCache.get(path);
    return { id: DRAFT_ID, name: name ?? '', modelPath: path, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, ...sizes };
  }, [mode, path, name, activeId, items]);
}
