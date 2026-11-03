import { describe, expect, it } from 'vitest';
import { obbBounds } from '@/shared/lib/math/geometry2d';
import {
  clampPartition,
  createPartition,
  maxCornerRadius,
  movePartition,
  partitionEndpoints,
  partitionFromEndpoints,
  resizePartition,
  rotatePartition,
} from './partitions';
import { partitionFootprint } from './placement';
import { withSill } from './openings';
import type { Partition } from '../types';

const dims = { width: 5, height: 2.8, depth: 4 };

const base = (): Partition => createPartition({ id: 'p', center: [0, 0], dims });

describe('createPartition', () => {
  it('creates a full-height wall with default thickness', () => {
    const p = base();
    expect(p.size[1]).toBeCloseTo(2.8);
    expect(p.size[2]).toBeCloseTo(0.1);
    expect(p.position[1]).toBeCloseTo(1.4);
    expect(p.cornerRadius).toBe(0);
  });

  it('keeps the partition inside the room', () => {
    const p = createPartition({ id: 'p', center: [10, 10], dims });
    const b = obbBounds(partitionFootprint(p));
    expect(b.maxX).toBeLessThanOrEqual(2.5 + 1e-6);
    expect(b.maxZ).toBeLessThanOrEqual(2 + 1e-6);
  });
});

describe('clampPartition', () => {
  it('limits sizes and removes tilt', () => {
    const p = clampPartition({ ...base(), size: [100, 10, 2], rotation: [0.3, 0.2, 0.1] }, dims);
    expect(p.size).toEqual([5, 2.8, 0.5]);
    expect(p.rotation).toEqual([0, 0.2, 0]);
  });

  it('limits corner radius to half the thickness', () => {
    const p = clampPartition({ ...base(), cornerRadius: 1 }, dims);
    expect(p.cornerRadius).toBeCloseTo(0.05);
    expect(maxCornerRadius(p)).toBeCloseTo(0.05);
  });

  it('re-fits openings when the partition becomes lower', () => {
    const door = withSill({ id: 'd', wallId: 'p', type: 'door', position: [0, 0], width: 0.9, height: 2.1 }, 0);
    const p = resizePartition({ ...base(), openings: [door] }, { height: 1.8 }, dims);
    expect(p.openings[0].height).toBeLessThanOrEqual(1.8 + 1e-6);
  });
});

describe('endpoints', () => {
  it('returns both ends along the local X axis', () => {
    const [a, b] = partitionEndpoints(base());
    expect(a[0]).toBeCloseTo(-1);
    expect(b[0]).toBeCloseTo(1);
  });

  it('rebuilds a partition from new endpoints', () => {
    const p = partitionFromEndpoints(base(), [0, -1], [0, 1], dims);
    expect(p.size[0]).toBeCloseTo(2);
    const [a, b] = partitionEndpoints(p);
    expect(a[1]).toBeCloseTo(-1);
    expect(b[1]).toBeCloseTo(1);
  });

  it('ignores degenerate endpoints', () => {
    const p = base();
    expect(partitionFromEndpoints(p, [0, 0], [0, 0], dims)).toBe(p);
  });
});

describe('move and rotate', () => {
  it('moves the center but stays inside the room', () => {
    const moved = movePartition(base(), [2.4, 0], dims);
    expect(obbBounds(partitionFootprint(moved)).maxX).toBeLessThanOrEqual(2.5 + 1e-6);
  });

  it('rotates around the vertical axis', () => {
    const rotated = rotatePartition(base(), Math.PI / 2, dims);
    expect(rotated.rotation[1]).toBeCloseTo(Math.PI / 2);
  });
});
