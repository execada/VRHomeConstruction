import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry2d';
import {
  clipPolygonToRect,
  cross2,
  distanceToPolygonEdge,
  lineIntersection,
  perp2,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  projectOnSegment,
} from './polygon';

const square: Vec2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
const lShape: Vec2[] = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]];

describe('polygon metrics', () => {
  it('computes signed area, perimeter and centroid', () => {
    expect(polygonArea(square)).toBeCloseTo(4);
    expect(polygonArea([...square].reverse())).toBeCloseTo(-4);
    expect(polygonArea(lShape)).toBeCloseTo(5);
    expect(polygonPerimeter(square)).toBeCloseTo(8);
    expect(polygonCentroid(square)).toEqual([1, 1]);
    expect(polygonCentroid([[0, 0], [1, 0], [2, 0]])).toEqual([1, 0]);
    expect(polygonCentroid([])).toEqual([0, 0]);
  });

  it('tests point containment, including concave shapes', () => {
    expect(pointInPolygon([1, 1], square)).toBe(true);
    expect(pointInPolygon([3, 1], square)).toBe(false);
    expect(pointInPolygon([2, 2], lShape)).toBe(false);
    expect(pointInPolygon([0.5, 2], lShape)).toBe(true);
  });

  it('measures the distance to the boundary', () => {
    expect(distanceToPolygonEdge([1, 0.5], square)).toBeCloseTo(0.5);
  });
});

describe('lines and segments', () => {
  it('intersects lines and detects parallels', () => {
    expect(lineIntersection([0, 0], [1, 0], [1, -1], [0, 1])).toEqual([1, 0]);
    expect(lineIntersection([0, 0], [1, 0], [0, 1], [2, 0])).toBeNull();
  });

  it('projects points on segments with clamping', () => {
    const r = projectOnSegment([1, 1], [0, 0], [2, 0]);
    expect(r.t).toBeCloseTo(0.5);
    expect(r.distance).toBeCloseTo(1);
    expect(projectOnSegment([-5, 0], [0, 0], [2, 0]).t).toBe(0);
    expect(projectOnSegment([1, 1], [0, 0], [0, 0]).distance).toBeCloseTo(Math.SQRT2);
  });

  it('provides cross and perpendicular helpers', () => {
    expect(cross2([1, 0], [0, 1])).toBe(1);
    expect(perp2([1, 0])).toEqual([-0, 1]);
  });
});

describe('clipPolygonToRect', () => {
  it('clips a polygon to a rectangle', () => {
    const clipped = clipPolygonToRect(square, { minX: 1, maxX: 3, minZ: -1, maxZ: 1 });
    expect(polygonArea(clipped)).toBeCloseTo(1);
  });

  it('returns an empty polygon when there is no overlap', () => {
    expect(clipPolygonToRect(square, { minX: 5, maxX: 6, minZ: 0, maxZ: 1 })).toHaveLength(0);
  });

  it('keeps a slanted end inside the clip', () => {
    const trapezoid: Vec2[] = [[0, -0.1], [2, -0.1], [2.2, 0.1], [0, 0.1]];
    const clipped = clipPolygonToRect(trapezoid, { minX: 1.5, maxX: 3, minZ: -1, maxZ: 1 });
    expect(polygonArea(clipped)).toBeCloseTo(0.5 * 0.2 + 0.2 * 0.2 / 2);
  });
});
