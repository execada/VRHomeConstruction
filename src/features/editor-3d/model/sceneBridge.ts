/**
 * Мост между DOM-интерфейсом и сценой three.js (разные React-деревья):
 * перевод экранных координат в точку на полу (drag & drop из каталога),
 * снимок сцены для превью проекта и счётчик FPS.
 * Реализации регистрирует компонент SceneBridge внутри Canvas.
 * @module editor-3d/model/sceneBridge
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { Vec2 } from '@/shared/lib/math/geometry2d';

type ScreenToFloor = (clientX: number, clientY: number) => Vec2 | null;
type Capture = (maxWidth: number) => string | null;

interface BridgeState {
  screenToFloor: ScreenToFloor | null;
  capture: Capture | null;
  /** Текущий FPS (обновляется дважды в секунду) */
  fps: number;
}

export const sceneBridgeStore = createExternalStore<BridgeState>({ screenToFloor: null, capture: null, fps: 0 });

export const sceneBridge = {
  /** Точка на полу под экранной точкой (null — сцена не готова или промах). */
  screenToFloor(clientX: number, clientY: number): Vec2 | null {
    return sceneBridgeStore.getState().screenToFloor?.(clientX, clientY) ?? null;
  },
  /** JPEG-снимок сцены в data URL (null — сцена не смонтирована). */
  capture(maxWidth = 480): string | null {
    try {
      return sceneBridgeStore.getState().capture?.(maxWidth) ?? null;
    } catch (error) {
      console.warn('Не удалось сделать снимок сцены', error);
      return null;
    }
  },
};
