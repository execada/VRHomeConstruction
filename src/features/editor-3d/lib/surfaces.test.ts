import { describe, expect, it } from 'vitest';
import { obbCorners, obbOverlap, pointInObb, type Obb } from '@/shared/lib/math/geometry2d';
import type { ModelSurface } from '@/features/furniture/lib/surfaceScan';
import type { FurnitureItem } from '@/features/furniture/types';
import { buildObstacles } from './placement';
import { findSurfaceSpot, placeOnSurface, supportSurfaces, surfaceAtPoint, surfaceByRay, type SupportSurface } from './surfaces';

const item = (id: string, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: 'primitive:desk',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  halfWidth: 0.7,
  halfDepth: 0.35,
  height: 0.75,
  ...extra,
});

const shelfLevels: ModelSurface[] = [1.72, 0.92, 0.52].map((y, i) => ({
  y,
  minX: -0.4,
  maxX: 0.4,
  minZ: -0.15,
  maxZ: 0.15,
  clearance: i === 0 ? Infinity : 0.36,
}));

const lamp = (center: [number, number], angle = 0): Obb => ({ center, half: [0.1, 0.15], angle });

/** Все углы футпринта внутри прямоугольника поверхности. */
const inside = (footprint: Obb, surface: SupportSurface) =>
  obbCorners(footprint).every((c) => pointInObb(c, { ...surface.area, half: [surface.area.half[0] + 1e-6, surface.area.half[1] + 1e-6] }));

describe('supportSurfaces', () => {
  it('uses the top of the bounding box until real surfaces are measured', () => {
    const [top] = supportSurfaces(item('desk'), undefined);
    expect(top).toMatchObject({ supportId: 'desk', y: 0.75, clearance: Infinity });
    expect(top.area).toEqual({ center: [0, 0], half: [0.7, 0.35], angle: 0 });
  });

  it('moves, rotates and scales measured surfaces with the support', () => {
    const shelf = item('shelf', { position: [1, 0.2, -1], rotation: [0, Math.PI / 2, 0], scale: 2 });
    const surfaces = supportSurfaces(shelf, [{ y: 0.5, minX: 0, maxX: 0.4, minZ: -0.1, maxZ: 0.1, clearance: 0.3 }]);
    expect(surfaces[0].y).toBeCloseTo(1.2);
    expect(surfaces[0].clearance).toBeCloseTo(0.6);
    expect(surfaces[0].area.half).toEqual([0.4, 0.2]);
    // локальный центр (0.4, 0) повёрнут на 90°: x → −z
    expect(surfaces[0].area.center[0]).toBeCloseTo(1);
    expect(surfaces[0].area.center[1]).toBeCloseTo(-1.4);
  });

  it('limits the free height by the ceiling', () => {
    const [top] = supportSurfaces(item('wardrobe', { height: 2.2 }), undefined, 2.7);
    expect(top.clearance).toBeCloseTo(0.5);
  });
});

describe('picking a surface', () => {
  const shelves = supportSurfaces(item('shelf', { halfWidth: 0.44, halfDepth: 0.16, height: 1.8 }), shelfLevels);

  it('takes the nearest surface along the pointer ray — the shelf you look at', () => {
    const fromFront = surfaceByRay(shelves, { origin: [0, 0.7, 2], direction: [0, -0.18, -2] }, 0.2);
    expect(fromFront?.surface.y).toBeCloseTo(0.52);
    const fromAbove = surfaceByRay(shelves, { origin: [0, 3, 0], direction: [0, -1, 0] }, 0.2);
    expect(fromAbove?.surface.y).toBeCloseTo(1.72);
    expect(fromAbove?.point[0]).toBeCloseTo(0);
  });

  it('ignores rays that look up or miss every surface', () => {
    expect(surfaceByRay(shelves, { origin: [0, 0.3, 2], direction: [0, 0.5, -1] }, 0.2)).toBeNull();
    expect(surfaceByRay(shelves, { origin: [3, 3, 0], direction: [0, -1, 0] }, 0.2)).toBeNull();
  });

  it('prefers the variant of a level where the item fits', () => {
    const low: SupportSurface = { supportId: 'tv', y: 0.4, area: { center: [0, 0], half: [0.7, 0.2], angle: 0 }, clearance: 0.06 };
    const open: SupportSurface = { ...low, area: { center: [0, 0.1], half: [0.7, 0.1], angle: 0 }, clearance: Infinity };
    expect(surfaceByRay([low, open], { origin: [0, 2, 0.1], direction: [0, -1, 0] }, 0.3)?.surface).toBe(open);
    expect(surfaceAtPoint([low, open], [0, 0.1], 0.3, null)).toBe(open);
  });

  it('keeps the current surface under a plan point, otherwise the highest one that fits', () => {
    expect(surfaceAtPoint(shelves, [0, 0], 0.2, { supportId: 'shelf', y: 0.92 })?.y).toBeCloseTo(0.92);
    expect(surfaceAtPoint(shelves, [0, 0], 0.2, null)?.y).toBeCloseTo(1.72);
    expect(surfaceAtPoint(shelves.slice(1), [0, 0], 0.5, null)?.y).toBeCloseTo(0.92);
    expect(surfaceAtPoint(shelves, [2, 0], 0.2, null)).toBeNull();
  });
});

describe('placeOnSurface', () => {
  const desk = item('desk');
  const [top] = supportSurfaces(desk, undefined);

  it('puts the item exactly on the surface and inside its edges', () => {
    const result = placeOnSurface(lamp([0.69, 0.3]), 0.5, top, []);
    expect(result.valid).toBe(true);
    expect(result.y).toBeCloseTo(0.75);
    expect(result.supportId).toBe('desk');
    expect(inside(result.footprint, top)).toBe(true);
    expect(result.footprint.center[0]).toBeCloseTo(0.6);
    expect(result.footprint.center[1]).toBeCloseTo(0.2);
  });

  it('does not let items on the same surface intersect', () => {
    const book = item('book', { supportId: 'desk', position: [0, 0.75, 0], halfWidth: 0.12, halfDepth: 0.15, height: 0.04 });
    const obstacles = buildObstacles([], [desk, book], 'lamp').filter((o) => o.id !== 'desk');
    const result = placeOnSurface(lamp([0.05, 0]), 0.5, top, obstacles);
    expect(result.valid).toBe(true);
    expect(obbOverlap(result.footprint, obstacles[0].footprint).overlapping).toBe(false);
  });

  it('works on rotated supports', () => {
    const [rotated] = supportSurfaces(item('desk', { rotation: [0, 0.6, 0], position: [1, 0, 1] }), undefined);
    const result = placeOnSurface(lamp([2, 2], 0.2), 0.5, rotated, []);
    expect(result.valid).toBe(true);
    expect(result.footprint.angle).toBe(0.2);
    expect(inside(result.footprint, rotated)).toBe(true);
  });

  it('refuses items that are too tall for the shelf or too big for the surface', () => {
    const [, shelf] = supportSurfaces(item('shelf', { halfWidth: 0.44, halfDepth: 0.16, height: 1.8 }), shelfLevels);
    expect(placeOnSurface(lamp([0, 0]), 0.9, shelf, []).valid).toBe(false);
    expect(placeOnSurface({ center: [0, 0], half: [0.5, 0.2], angle: 0 }, 0.1, shelf, []).valid).toBe(false);
  });
});

describe('findSurfaceSpot', () => {
  const [top] = supportSurfaces(item('desk'), undefined);
  const vase = item('vase', { supportId: 'desk', position: [0, 0.75, 0], halfWidth: 0.1, halfDepth: 0.1, height: 0.3 });

  it('finds a free spot next to an occupied one on the same surface', () => {
    const obstacles = buildObstacles([], [vase]);
    const spot = findSurfaceSpot(lamp([0, 0]), 0.5, top, obstacles);
    expect(spot?.valid).toBe(true);
    expect(obbOverlap(spot!.footprint, obstacles[0].footprint).overlapping).toBe(false);
    expect(inside(spot!.footprint, top)).toBe(true);
  });

  it('returns null when the surface is full', () => {
    const small: SupportSurface = { ...top, area: { center: [0, 0], half: [0.12, 0.12], angle: 0 } };
    expect(findSurfaceSpot(lamp([0, 0]), 0.5, small, buildObstacles([], [vase]))).toBeNull();
  });
});
