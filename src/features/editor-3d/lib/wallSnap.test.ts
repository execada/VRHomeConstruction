import { describe, expect, it } from 'vitest';
import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { snapWallPoint } from './wallSnap';
import type { Partition } from '../types';

const dims = { width: 6, height: 3, depth: 4 };

function wall(id: string, a: Vec2, b: Vec2, thickness = 0.1): Partition {
  const d = sub2(b, a);
  return {
    id,
    position: [(a[0] + b[0]) / 2, 1.5, (a[1] + b[1]) / 2],
    rotation: [0, Math.atan2(-d[1], d[0]), 0],
    size: [length2(d), 3, thickness],
    openings: [],
  };
}

const host = wall('h', [-2, 0], [2, 0], 0.2);

describe('snapWallPoint', () => {
  it('snaps to the end of another wall', () => {
    const r = snapWallPoint([2.1, 0.12], dims, [host]);
    expect(r.kind).toBe('endpoint');
    expect(r.point[0]).toBeCloseTo(2);
    expect(r.point[1]).toBeCloseTo(0);
  });

  it('projects onto the axis of another wall for a T joint', () => {
    const r = snapWallPoint([0.5, 0.15], dims, [host]);
    expect(r).toEqual({ point: [0.5, expect.closeTo(0)], kind: 'wall' });
  });

  it('snaps to the inner face of an outer wall and clamps inside the room', () => {
    expect(snapWallPoint([1, -1.9], dims, [])).toEqual({ point: [1, -2], kind: 'outer' });
    expect(snapWallPoint([10, 0.5], dims, []).point).toEqual([3, 0.5]);
  });

  it('keeps the drawing direction when hitting a wall at a snapped angle', () => {
    const r = snapWallPoint([0.03, 1.85], dims, [], { from: [0, 0.5] });
    expect(r.kind).toBe('outer');
    expect(r.point[0]).toBeCloseTo(0);
    expect(r.point[1]).toBeCloseTo(2);
  });

  it('snaps the direction to multiples of 45 degrees', () => {
    const r = snapWallPoint([1.05, 1.0], dims, [], { from: [0, 0] });
    expect(r.kind).toBe('angle');
    expect(r.point[0]).toBeCloseTo(r.point[1]);
  });

  it('falls back to the grid, ignoring the excluded wall', () => {
    const r = snapWallPoint([0.53, 0.05], dims, [host], { grid: 0.1, excludeId: 'h', from: [0.53, 1.5] });
    expect(r.kind).toBe('angle');
    const g = snapWallPoint([0.53, 0.47], dims, [host], { grid: 0.1, excludeId: 'h' });
    expect(g).toEqual({ point: [expect.closeTo(0.5), expect.closeTo(0.5)], kind: 'grid' });
    expect(snapWallPoint([0.53, 0.47], dims, []).kind).toBe('none');
  });
});
