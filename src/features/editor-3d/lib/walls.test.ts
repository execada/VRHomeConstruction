import { describe, expect, it } from 'vitest';
import {
  freeIntervals,
  interiorRect,
  isWallFacingAway,
  isWallSide,
  nearestWall,
  openingHole,
  partitionFrame,
  wallBox,
  wallFrame,
  wallFrames,
  wallPieces,
  wallToWorld,
  worldToWall,
} from './walls';
import type { Opening, Partition } from '../types';

const dims = { width: 4, height: 3, depth: 6 };

describe('wall frames', () => {
  it('places interior faces on the room boundary with inward normals', () => {
    const back = wallFrame('back', dims);
    expect(back.origin).toEqual([-0, -3]);
    expect(back.normal[1]).toBeCloseTo(1);
    expect(back.length).toBe(4);

    const left = wallFrame('left', dims);
    expect(left.origin[0]).toBeCloseTo(-2);
    expect(left.normal[0]).toBeCloseTo(1);
    expect(left.length).toBe(6);
  });

  it('uses a tangent pointing to the right when looking from inside', () => {
    expect(wallFrame('back', dims).tangent[0]).toBeCloseTo(1);
    expect(wallFrame('front', dims).tangent[0]).toBeCloseTo(-1);
    expect(wallFrame('left', dims).tangent[1]).toBeCloseTo(-1);
    expect(wallFrame('right', dims).tangent[1]).toBeCloseTo(1);
  });

  it('returns frames for all four walls', () => {
    expect(wallFrames(dims).map((f) => f.id)).toEqual(['front', 'back', 'left', 'right']);
  });

  it('converts between wall-local and world coordinates', () => {
    const frame = wallFrame('right', dims);
    const world = wallToWorld(frame, 1, 1.5, 0.2);
    expect(world[0]).toBeCloseTo(1.8);
    expect(world[1]).toBe(1.5);
    expect(world[2]).toBeCloseTo(1);
    const local = worldToWall(frame, world);
    expect(local.u).toBeCloseTo(1);
    expect(local.depth).toBeCloseTo(0.2);
  });

  it('builds partition frames from rotation', () => {
    const partition: Partition = {
      id: 'p1',
      position: [1, 1.5, 0],
      rotation: [0, Math.PI / 2, 0],
      size: [2, 3, 0.1],
      openings: [],
    };
    const frame = partitionFrame(partition);
    expect(frame.origin).toEqual([1, 0]);
    expect(frame.tangent[1]).toBeCloseTo(-1);
    expect(frame.length).toBe(2);
  });
});

describe('wall boxes', () => {
  it('extends front/back walls over the corners', () => {
    const box = wallBox('front', dims, 0.2);
    expect(box.length).toBeCloseTo(4.4);
    expect(box.base[1]).toBeCloseTo(3.1);
    expect(wallBox('left', dims, 0.2).length).toBe(6);
  });
});

describe('wallPieces', () => {
  it('returns the whole wall when there are no openings', () => {
    expect(wallPieces(-2, 2, 3, [])).toEqual([{ u0: -2, u1: 2, v0: 0, v1: 3 }]);
  });

  it('cuts a window into four pieces', () => {
    const pieces = wallPieces(-2, 2, 3, [{ u0: -0.5, u1: 0.5, v0: 1, v1: 2 }]);
    expect(pieces).toHaveLength(4);
    const area = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0);
    expect(area).toBeCloseTo(12 - 1);
  });

  it('handles a door touching the floor', () => {
    const pieces = wallPieces(-2, 2, 3, [{ u0: 0, u1: 1, v0: 0, v1: 2.1 }]);
    const area = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0);
    expect(area).toBeCloseTo(12 - 2.1);
    expect(pieces.every((p) => p.v1 - p.v0 > 0)).toBe(true);
  });

  it('is robust to overlapping and out-of-range holes', () => {
    const pieces = wallPieces(-1, 1, 2, [
      { u0: -1.5, u1: 0, v0: 0.5, v1: 1.5 },
      { u0: -0.2, u1: 0.4, v0: 1, v1: 3 },
    ]);
    const area = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0);
    const holeArea = 1 * 1 + 0.6 * 1 - 0.2 * 0.5;
    expect(area).toBeCloseTo(4 - holeArea);
  });

  it('builds holes from openings', () => {
    const opening: Opening = { id: 'o', wallId: 'back', type: 'window', position: [0.5, 1.5], width: 1, height: 1.2 };
    expect(openingHole(opening)).toEqual({ u0: 0, u1: 1, v0: 0.9, v1: 2.1 });
  });
});

describe('helpers', () => {
  it('computes free intervals', () => {
    expect(freeIntervals(0, 10, [[2, 3], [5, 6]])).toEqual([[0, 2], [3, 5], [6, 10]]);
    expect(freeIntervals(0, 1, [[-1, 2]])).toEqual([]);
  });

  it('validates wall sides', () => {
    expect(isWallSide('front')).toBe(true);
    expect(isWallSide('part_1')).toBe(false);
  });

  it('builds the interior rectangle', () => {
    expect(interiorRect(dims)).toEqual({ minX: -2, maxX: 2, minZ: -3, maxZ: 3 });
  });

  it('finds the nearest wall', () => {
    expect(nearestWall([1.8, 0], dims)).toEqual({ side: 'right', distance: expect.closeTo(0.2) });
    expect(nearestWall([0, -2.9], dims).side).toBe('back');
  });

  it('hides walls whose outside faces the camera', () => {
    const front = wallFrame('front', dims);
    expect(isWallFacingAway(front, [0, 8])).toBe(true);
    expect(isWallFacingAway(front, [0, 0])).toBe(false);
  });
});
