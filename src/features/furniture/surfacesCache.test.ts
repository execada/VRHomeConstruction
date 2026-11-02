import { describe, expect, it, vi } from 'vitest';
import { furnitureSurfacesCache, surfacesStore } from './surfacesCache';

describe('furnitureSurfacesCache', () => {
  it('stores surfaces per model path and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = surfacesStore.subscribe(listener);
    const before = surfacesStore.getState().byPath;
    const top = { y: 0.75, minX: -0.7, maxX: 0.7, minZ: -0.35, maxZ: 0.35, clearance: Infinity };

    expect(furnitureSurfacesCache.has('primitive:desk')).toBe(false);
    furnitureSurfacesCache.set('primitive:desk', [top]);

    expect(furnitureSurfacesCache.get('primitive:desk')).toEqual([top]);
    expect(furnitureSurfacesCache.has('primitive:desk')).toBe(true);
    expect(furnitureSurfacesCache.get('primitive:shelf')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(before.has('primitive:desk')).toBe(false);
    unsubscribe();
  });
});
