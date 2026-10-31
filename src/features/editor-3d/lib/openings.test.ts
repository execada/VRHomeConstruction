import { describe, expect, it } from 'vitest';
import {
  clampOpening,
  clampOpeningSize,
  createOpening,
  moveOpening,
  nearestFreeCenter,
  normalizeWallOpenings,
  openingCenterRange,
  openingSill,
  openingSillRange,
  openingsOverlap,
  resizeOpening,
  withSill,
} from './openings';
import type { Opening } from '../types';

const host = { length: 4, height: 2.7 };

const win = (id: string, u: number, width = 1, height = 1.2, sill = 0.9): Opening =>
  withSill({ id, wallId: 'back', type: 'window', position: [u, 0], width, height }, sill);

const door = (id: string, u: number): Opening => ({
  id,
  wallId: 'back',
  type: 'door',
  position: [u, 1.05],
  width: 0.9,
  height: 2.1,
});

describe('sill helpers', () => {
  it('converts between sill height and center', () => {
    const w = win('w', 0, 1, 1.2, 0.9);
    expect(w.position[1]).toBeCloseTo(1.5);
    expect(openingSill(w)).toBeCloseTo(0.9);
  });

  it('keeps doors on the floor', () => {
    expect(openingSillRange(door('d', 0), host)).toEqual([0, 0]);
  });

  it('limits window sill so the window fits under the ceiling', () => {
    const [min, max] = openingSillRange(win('w', 0, 1, 1.2), host);
    expect(min).toBeCloseTo(0.1);
    expect(max).toBeCloseTo(2.7 - 1.2 - 0.05);
  });
});

describe('clamping', () => {
  it('limits size to the wall', () => {
    const huge = clampOpeningSize(win('w', 0, 10, 5), host);
    expect(huge.width).toBeCloseTo(3.8);
    expect(huge.height).toBeCloseTo(2.7 - 0.1 - 0.05);
  });

  it('keeps the opening away from wall edges', () => {
    expect(openingCenterRange(1, host)).toEqual([-1.4, 1.4]);
    expect(clampOpening(win('w', 5), host).position[0]).toBeCloseTo(1.4);
  });

  it('puts doors back on the floor', () => {
    const floating = { ...door('d', 0), position: [0, 2] as [number, number] };
    expect(openingSill(clampOpening(floating, host))).toBeCloseTo(0);
  });
});

describe('overlap and free space', () => {
  it('detects horizontal overlap including the minimal gap', () => {
    expect(openingsOverlap(win('a', 0), win('b', 1.05))).toBe(true);
    expect(openingsOverlap(win('a', 0), win('b', 1.1))).toBe(false);
  });

  it('finds the nearest free center next to a neighbour', () => {
    const others = [win('a', 0)];
    expect(nearestFreeCenter(0.2, 1, host, others)).toBeCloseTo(1.1);
    expect(nearestFreeCenter(-0.3, 1, host, others)).toBeCloseTo(-1.1);
  });

  it('returns null when the wall is full', () => {
    const others = [win('a', -1, 1.6), win('b', 1, 1.6)];
    expect(nearestFreeCenter(0, 1, host, others)).toBeNull();
  });
});

describe('moveOpening', () => {
  it('slides up to a neighbour instead of overlapping it', () => {
    const moved = moveOpening(win('b', 1.4), { u: 0.3, y: 1.5 }, host, [win('a', 0)]);
    expect(moved.position[0]).toBeCloseTo(1.1);
  });

  it('clamps sill height while dragging vertically', () => {
    const moved = moveOpening(win('w', 0), { u: 0, y: 10 }, host, []);
    expect(openingSill(moved)).toBeCloseTo(2.7 - 1.2 - 0.05);
  });

  it('never lifts doors', () => {
    const moved = moveOpening(door('d', 0), { u: 0.5, y: 2 }, host, []);
    expect(openingSill(moved)).toBeCloseTo(0);
    expect(moved.position[0]).toBeCloseTo(0.5);
  });
});

describe('resizeOpening', () => {
  it('keeps the sill when height changes', () => {
    const resized = resizeOpening(win('w', 0), { height: 1.5 }, host, []);
    expect(resized.height).toBeCloseTo(1.5);
    expect(openingSill(resized)).toBeCloseTo(0.9);
  });

  it('moves the opening when the new width collides with a neighbour', () => {
    const resized = resizeOpening(win('b', 1.1), { width: 1.4 }, host, [win('a', -0.6, 0.6)]);
    expect(resized.width).toBeCloseTo(1.4);
    expect(openingsOverlap(resized, win('a', -0.6, 0.6))).toBe(false);
  });
});

describe('createOpening', () => {
  it('creates a standard window at the preferred spot', () => {
    const created = createOpening({ id: 'n', type: 'window', wallId: 'left', host, others: [] });
    expect(created).not.toBeNull();
    expect(created!.width).toBeCloseTo(1.2);
    expect(openingSill(created!)).toBeCloseTo(0.9);
  });

  it('creates doors on the floor with a ceiling-limited height', () => {
    const low = createOpening({ id: 'd', type: 'door', wallId: 'back', host: { length: 3, height: 2 }, others: [] });
    expect(openingSill(low!)).toBeCloseTo(0);
    expect(low!.height).toBeCloseTo(1.95);
  });

  it('returns null when there is no space', () => {
    const others = [win('a', -1, 1.6), win('b', 1, 1.6)];
    expect(createOpening({ id: 'x', type: 'window', wallId: 'back', host, others })).toBeNull();
  });
});

describe('normalizeWallOpenings', () => {
  it('re-fits openings after the wall became shorter and drops what no longer fits', () => {
    const result = normalizeWallOpenings([win('a', -1.4), win('b', 0), win('c', 1.4)], { length: 2.4, height: 2.7 });
    expect(result.length).toBeLessThan(3);
    for (let i = 1; i < result.length; i += 1) {
      expect(openingsOverlap(result[i - 1], result[i])).toBe(false);
    }
  });
});
