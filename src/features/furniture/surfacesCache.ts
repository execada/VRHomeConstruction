/**
 * Кеш поверхностей моделей по пути модели. Поверхности опоры измеряются один раз —
 * когда её модель впервые загружается в 3D-сцене; до этого команды используют верх габарита.
 * На кеш можно подписаться (подсказки поверхностей в сцене обновятся после измерения).
 * @module furniture/surfacesCache
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { ModelSurface } from './lib/surfaceScan';

interface SurfacesState {
  byPath: ReadonlyMap<string, readonly ModelSurface[]>;
}

/** Store кеша (для подписки из React через useExternalStore). */
export const surfacesStore = createExternalStore<SurfacesState>({ byPath: new Map() });

export const furnitureSurfacesCache = {
  /** Поверхности модели (undefined — ещё не измерены) */
  get: (path: string): readonly ModelSurface[] | undefined => surfacesStore.getState().byPath.get(path),
  /** Измерены ли поверхности модели */
  has: (path: string): boolean => surfacesStore.getState().byPath.has(path),
  /** Сохранить измеренные поверхности модели */
  set: (path: string, surfaces: readonly ModelSurface[]): void => {
    surfacesStore.setState((s) => ({ byPath: new Map(s.byPath).set(path, surfaces) }));
  },
};
