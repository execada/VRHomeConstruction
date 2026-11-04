import { describe, expect, it } from 'vitest';
import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { polygonArea } from '@/shared/lib/math/polygon';
import { analyzeWalls, type InteriorWallShape } from './wallJoints';
import type { Partition } from '../types';

const dims = { width: 6, height: 3, depth: 4 };

/** Внутренняя стена по двум концам (как её строит partitionFromEndpoints). */
function wall(id: string, a: Vec2, b: Vec2, thickness = 0.1, cornerRadius = 0): Partition {
  const d = sub2(b, a);
  return {
    id,
    position: [(a[0] + b[0]) / 2, 1.5, (a[1] + b[1]) / 2],
    rotation: [0, Math.atan2(-d[1], d[0]), 0],
    size: [length2(d), 3, thickness],
    openings: [],
    cornerRadius,
  };
}

const area = (shape: InteriorWallShape) => shape.spans.reduce((s, sp) => s + polygonArea(sp.polygon), 0);

describe('analyzeWalls', () => {
  it('keeps a free-standing wall as a plain rectangle without joint zones', () => {
    const layout = analyzeWalls(dims, [wall('w', [-1, 0], [1, 0])]);
    expect(layout.interior.w.spans).toHaveLength(1);
    expect(area(layout.interior.w)).toBeCloseTo(0.2);
    expect(layout.interior.w.blocked).toEqual([]);
    expect(layout.outer.back).toEqual([]);
  });

  it('butts a wall flush against the inner face of an outer wall (T joint)', () => {
    const layout = analyzeWalls(dims, [wall('w', [0, -2], [0, 0])]);
    expect(area(layout.interior.w)).toBeCloseTo(0.2);
    const [zone] = layout.outer.back;
    expect(zone[0]).toBeCloseTo(-0.05);
    expect(zone[1]).toBeCloseTo(0.05);
  });

  it('cuts a slanted wall along the outer wall face', () => {
    const layout = analyzeWalls(dims, [wall('w', [0, -2], [1, 0])]);
    const [shape] = layout.interior.w.spans;
    expect(polygonArea(shape.polygon)).toBeGreaterThan(0);
    expect(layout.outer.back[0][1] - layout.outer.back[0][0]).toBeGreaterThan(0.1);
  });

  it('trims a wall ending on another wall to that wall face (T joint)', () => {
    const layout = analyzeWalls(dims, [wall('h', [-2, 0], [2, 0], 0.2), wall('j', [0, 0], [0, 1.5])]);
    expect(area(layout.interior.j)).toBeCloseTo(1.4 * 0.1);
    expect(area(layout.interior.h)).toBeCloseTo(4 * 0.2);
    const zone = layout.interior.h.blocked.find((z) => z[0] < 0 && z[1] > 0)!;
    expect(zone[0]).toBeCloseTo(-0.05);
    expect(zone[1]).toBeCloseTo(0.05);
    expect(layout.interior.j.blocked[0][1] - layout.interior.j.blocked[0][0]).toBeCloseTo(0.1);
  });

  it('mitres an L corner without gaps or overlaps', () => {
    const layout = analyzeWalls(dims, [wall('a', [0, 0], [2, 0], 0.2), wall('b', [0, 0], [0, 1.5], 0.2)]);
    expect(area(layout.interior.a) + area(layout.interior.b)).toBeCloseTo(2.1 * 0.2 + 0.2 * 1.6 - 0.04);
  });

  it('splits the later wall at an X crossing', () => {
    const layout = analyzeWalls(dims, [wall('a', [-2, 0], [2, 0], 0.2), wall('b', [0, -1.5], [0, 1.5])]);
    expect(layout.interior.a.spans).toHaveLength(1);
    expect(layout.interior.b.spans).toHaveLength(2);
    expect(area(layout.interior.b)).toBeCloseTo(2.8 * 0.1);
    expect(layout.interior.a.blocked.some((z) => z[0] < 0 && z[1] > 0)).toBe(true);
    expect(layout.interior.b.blocked.some((z) => Math.abs(z[0] + 0.1) < 1e-6 && Math.abs(z[1] - 0.1) < 1e-6)).toBe(true);
  });

  it('fills a three-way node completely', () => {
    const layout = analyzeWalls(dims, [
      wall('a', [0, 0], [2, 0], 0.2),
      wall('b', [0, 0], [-2, 0], 0.2),
      wall('c', [0, 0], [0, 1.5], 0.2),
    ]);
    const total = ['a', 'b', 'c'].reduce((s, id) => s + area(layout.interior[id]), 0);
    expect(total).toBeCloseTo(4 * 0.2 + 1.4 * 0.2);
  });

  it('rounds free ends and keeps openings away from the rounding', () => {
    const layout = analyzeWalls(dims, [wall('w', [-1, 0], [1, 0], 0.1, 0.05)]);
    expect(area(layout.interior.w)).toBeLessThan(0.2);
    expect(area(layout.interior.w)).toBeGreaterThan(0.195);
    expect(layout.interior.w.blocked[0]).toEqual([-1, expect.closeTo(-0.95)]);
  });

  it('falls back to flat ends for very sharp corners', () => {
    const layout = analyzeWalls(dims, [wall('a', [0, 0], [2, 0]), wall('b', [0, 0], [2, 0.2])]);
    expect(area(layout.interior.a)).toBeCloseTo(0.2);
    expect(area(layout.interior.b)).toBeCloseTo(length2([2, 0.2]) * 0.1);
  });
});
