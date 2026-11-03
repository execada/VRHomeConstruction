import { describe, expect, it } from 'vitest';
import { uniformOuterWalls } from '../constants';
import { cachedRooms, cachedWalkObstacles, cachedWallLayout } from './layoutCache';
import type { WalkScene } from './walkObstacles';

const dims = { width: 4, height: 3, depth: 4 };

describe('layout cache', () => {
  it('reuses results while the inputs are the same objects', () => {
    const partitions: WalkScene['partitions'] = [];
    expect(cachedWallLayout(dims, partitions)).toBe(cachedWallLayout(dims, partitions));
    expect(cachedRooms(dims, partitions)).toBe(cachedRooms(dims, partitions));
    expect(cachedRooms(dims, [])).not.toBe(cachedRooms({ ...dims }, []));
  });

  it('recomputes walk obstacles only when walls or openings change', () => {
    const scene: WalkScene = { dimensions: dims, outerWalls: uniformOuterWalls(0.2), removedWalls: [], openings: {}, partitions: [] };
    const first = cachedWalkObstacles(scene);
    expect(cachedWalkObstacles({ ...scene })).toBe(first);
    const opened = cachedWalkObstacles({ ...scene, removedWalls: ['front'] });
    expect(opened).not.toBe(first);
    expect(opened.length).toBeLessThan(first.length);
  });
});
