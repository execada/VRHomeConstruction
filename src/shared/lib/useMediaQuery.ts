/**
 * Подписка на медиазапрос (например, узкий экран телефона).
 * @module shared/lib/useMediaQuery
 */

import { useSyncExternalStore } from 'react';

/** Совпадает ли медиазапрос сейчас (без window — false). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
