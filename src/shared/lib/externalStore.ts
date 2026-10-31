/**
 * Минимальный внешний store для высокочастотного UI-состояния (перетаскивание,
 * призрак размещения, указатель на полу). Обновления не проходят через Redux,
 * поэтому не вызывают перерисовку всего редактора на каждый кадр.
 * @module shared/lib/externalStore
 */

import { useSyncExternalStore } from 'react';

/** Внешний store. */
export interface ExternalStore<T> {
  getState: () => T;
  /** Обновить состояние частично (создаётся новый объект) */
  setState: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Создать store с начальным состоянием. */
export function createExternalStore<T extends object>(initial: T): ExternalStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Подписаться на часть состояния store.
 * Селектор должен возвращать примитив или стабильную ссылку.
 */
export function useExternalStore<T, S>(store: ExternalStore<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
