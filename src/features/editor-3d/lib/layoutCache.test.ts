import { describe, expect, it } from 'vitest';
import type { Partition } from '../types';
import { cachedRooms, cachedWallLayout } from './layoutCache';

const dims = { width: 4, height: 3, depth: 4 };

describe('layout cache', () => {
  it('reuses results while the inputs are the same objects', () => {
    const partitions: Partition[] = [];
    expect(cachedWallLayout(dims, partitions)).toBe(cachedWallLayout(dims, partitions));
    expect(cachedRooms(dims, partitions)).toBe(cachedRooms(dims, partitions));
    expect(cachedRooms(dims, [])).not.toBe(cachedRooms({ ...dims }, []));
  });

  it('keeps a result per floor: floors do not evict each other', () => {
    const lower: Partition[] = [];
    const upper: Partition[] = [];
    const upperDims = { width: 6, height: 3, depth: 5 };
    const first = cachedRooms(dims, lower);
    const second = cachedRooms(upperDims, upper);
    expect(cachedRooms(dims, lower)).toBe(first);
    expect(cachedRooms(upperDims, upper)).toBe(second);
    expect(second[0].area).toBeCloseTo(30);
  });
});
