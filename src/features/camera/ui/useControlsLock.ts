/**
 * Блокировка управления камерой на время перетаскивания объектов.
 * Подписка синхронная (не через рендер React), поэтому камера не успевает
 * повернуться в первый момент перетаскивания предмета.
 * @module camera/ui/useControlsLock
 */

import { useEffect, type RefObject } from 'react';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';

interface Lockable {
  enabled: boolean;
}

/** Отключать controls, пока идёт перетаскивание или поворот объекта. */
export function useControlsLock(controls: RefObject<Lockable | null>): void {
  useEffect(() => {
    const sync = () => {
      const { mode } = interactionStore.getState();
      if (controls.current) controls.current.enabled = mode !== 'dragging' && mode !== 'rotating';
    };
    sync();
    return interactionStore.subscribe(sync);
  }, [controls]);
}
