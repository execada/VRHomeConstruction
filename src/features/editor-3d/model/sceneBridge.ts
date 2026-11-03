/**
 * Мост между DOM-интерфейсом и сценой three.js (разные React-деревья):
 * перевод экранных координат в точку на полу и в луч камеры (drag & drop из каталога —
 * луч выбирает поверхность опоры), снимок сцены для превью проекта и счётчик FPS.
 * Реализации регистрирует компонент SceneBridge внутри Canvas.
 * @module editor-3d/model/sceneBridge
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import type { Ray3 } from '../lib/surfaces';

type ScreenToFloor = (clientX: number, clientY: number) => Vec2 | null;
type ScreenToRay = (clientX: number, clientY: number) => Ray3 | null;
type Capture = (maxWidth: number) => string | null;

interface BridgeState {
  screenToFloor: ScreenToFloor | null;
  screenToRay: ScreenToRay | null;
  capture: Capture | null;
  /** Текущий FPS (обновляется дважды в секунду) */
  fps: number;
}

export const sceneBridgeStore = createExternalStore<BridgeState>({ screenToFloor: null, screenToRay: null, capture: null, fps: 0 });

export const sceneBridge = {
  /** Точка на полу под экранной точкой (null — сцена не готова или промах). */
  screenToFloor(clientX: number, clientY: number): Vec2 | null {
    return sceneBridgeStore.getState().screenToFloor?.(clientX, clientY) ?? null;
  },
  /** Луч камеры через экранную точку (null — сцена не готова). */
  screenToRay(clientX: number, clientY: number): Ray3 | null {
    return sceneBridgeStore.getState().screenToRay?.(clientX, clientY) ?? null;
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
