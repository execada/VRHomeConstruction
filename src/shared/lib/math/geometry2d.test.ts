import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampObbToRect,
  normalizeAngle,
  normalize2,
  obbBounds,
  obbCorners,
  obbExtents,
  obbInsideRect,
  obbOverlap,
  pointInObb,
  rotateLocal,
  snapAngle,
  snapTo,
  toLocal,
  type Obb,
} from './geometry2d';

const box = (x: number, z: number, hx: number, hz: number, angle = 0): Obb => ({
  center: [x, z],
  half: [hx, hz],
  angle,
});

describe('basic helpers', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('snaps to grid step and ignores non-positive steps', () => {
    expect(snapTo(0.37, 0.25)).toBeCloseTo(0.25);
    expect(snapTo(0.38, 0.25)).toBeCloseTo(0.5);
    expect(snapTo(0.38, 0)).toBe(0.38);
  });

  it('normalizes angles into (-PI, PI]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(Math.PI / 2 + 2 * Math.PI)).toBeCloseTo(Math.PI / 2);
  });

  it('snaps angles to a step', () => {
    expect(snapAngle(0.3, Math.PI / 12)).toBeCloseTo(Math.PI / 12);
  });

  it('normalizes vectors and keeps zero vector', () => {
    expect(normalize2([3, 4])).toEqual([0.6, 0.8]);
    expect(normalize2([0, 0])).toEqual([0, 0]);
  });
});

describe('rotation convention (three.js, around +Y)', () => {
  it('maps local +X to (cos, -sin) and +Z to (sin, cos)', () => {
    const x = rotateLocal([1, 0], Math.PI / 2);
    const z = rotateLocal([0, 1], Math.PI / 2);
    expect(x[0]).toBeCloseTo(0);
    expect(x[1]).toBeCloseTo(-1);
    expect(z[0]).toBeCloseTo(1);
    expect(z[1]).toBeCloseTo(0);
  });

  it('toLocal is the inverse of rotateLocal', () => {
    const world = rotateLocal([0.3, -1.2], 0.7);
    const back = toLocal(world, 0.7);
    expect(back[0]).toBeCloseTo(0.3);
    expect(back[1]).toBeCloseTo(-1.2);
  });
});

describe('OBB extents and corners', () => {
  it('returns half sizes for axis-aligned boxes', () => {
    expect(obbExtents(box(0, 0, 1, 0.5))).toEqual([1, 0.5]);
  });

  it('swaps extents for a 90 degree rotation', () => {
    const [ex, ez] = obbExtents(box(0, 0, 1, 0.5, Math.PI / 2));
    expect(ex).toBeCloseTo(0.5);
    expect(ez).toBeCloseTo(1);
  });

  it('computes bounds around rotated boxes', () => {
    const b = obbBounds(box(1, 2, 1, 1, Math.PI / 4));
    expect(b.maxX - b.minX).toBeCloseTo(2 * Math.SQRT2);
    expect(b.minZ).toBeCloseTo(2 - Math.SQRT2);
  });

  it('produces four corners around the center', () => {
    const corners = obbCorners(box(1, 1, 0.5, 0.25));
    expect(corners).toHaveLength(4);
    expect(corners[0]).toEqual([0.5, 0.75]);
    expect(corners[2]).toEqual([1.5, 1.25]);
  });
});

describe('obbOverlap (SAT)', () => {
  it('detects separated boxes', () => {
    expect(obbOverlap(box(0, 0, 0.5, 0.5), box(2, 0, 0.5, 0.5)).overlapping).toBe(false);
  });

  it('does not treat touching boxes as overlapping', () => {
    expect(obbOverlap(box(0, 0, 0.5, 0.5), box(1, 0, 0.5, 0.5)).overlapping).toBe(false);
  });

  it('returns the minimal push-out vector for the first box', () => {
    const result = obbOverlap(box(0.8, 0, 0.5, 0.5), box(0, 0, 0.5, 0.5));
    expect(result.overlapping).toBe(true);
    expect(result.depth).toBeCloseTo(0.2);
    expect(result.mtv[0]).toBeCloseTo(0.2);
    expect(result.mtv[1]).toBeCloseTo(0);
  });

  it('pushes in the negative direction when the obstacle is on the right', () => {
    const result = obbOverlap(box(-0.1, 0, 0.5, 0.5), box(0.7, 0, 0.5, 0.5));
    expect(result.mtv[0]).toBeCloseTo(-0.2);
  });

  it('handles rotated boxes that only overlap diagonally', () => {
    const rotated = box(1.2, 0, 0.5, 0.5, Math.PI / 4);
    expect(obbOverlap(box(0, 0, 0.5, 0.5), rotated).overlapping).toBe(true);
    const far = box(1.3, 1.3, 0.5, 0.5, Math.PI / 4);
    expect(obbOverlap(box(0, 0, 0.5, 0.5), far).overlapping).toBe(false);
  });
});

describe('rect helpers', () => {
  const room = { minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.5 };

  it('clamps a box inside the room', () => {
    const clamped = clampObbToRect(box(1.9, -1.4, 0.5, 0.3), room);
    expect(clamped.center).toEqual([1.5, -1.2]);
    expect(obbInsideRect(clamped, room)).toBe(true);
  });

  it('centers boxes that are larger than the room', () => {
    const clamped = clampObbToRect(box(1, 1, 3, 0.2), room);
    expect(clamped.center[0]).toBe(0);
  });

  it('keeps rotation and size when clamping', () => {
    const original = box(5, 5, 0.4, 0.2, 1);
    const clamped = clampObbToRect(original, room);
    expect(clamped.half).toBe(original.half);
    expect(clamped.angle).toBe(1);
  });

  it('detects points inside rotated boxes', () => {
    const rotated = box(0, 0, 1, 0.1, Math.PI / 2);
    expect(pointInObb([0, 0.9], rotated)).toBe(true);
    expect(pointInObb([0.9, 0], rotated)).toBe(false);
  });
});
