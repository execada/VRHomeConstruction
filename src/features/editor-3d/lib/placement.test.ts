import { describe, expect, it } from 'vitest';
import { obbBounds, obbOverlap } from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import {
  autoOrientAngle,
  buildObstacles,
  facingRoomAngle,
  findFreeSpot,
  furnitureFootprint,
  furnitureSubject,
  isFlatItem,
  isPlacementFree,
  itemSizes,
  partitionFootprint,
  resolvePlacement,
  snapToWalls,
  type PlacementOptions,
} from './placement';
import { interiorRect } from './walls';
import type { Partition } from '../types';

const dims = { width: 4, height: 2.7, depth: 4 };
const rect = interiorRect(dims);
const free: PlacementOptions = { gridStep: null, wallMagnet: 0 };

const item = (id: string, x: number, z: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: 'primitive:desk',
  position: [x, 0, z],
  rotation: [0, 0, 0],
  scale: 1,
  halfWidth: 0.5,
  halfDepth: 0.3,
  height: 0.75,
  ...extra,
});

const wall = (x: number, z: number, angle = 0, length = 2): Partition => ({
  id: `p_${x}_${z}`,
  position: [x, 1.35, z],
  rotation: [0, angle, 0],
  size: [length, 2.7, 0.1],
  openings: [],
});

describe('item sizes and footprints', () => {
  it('scales measured sizes', () => {
    expect(itemSizes(item('a', 0, 0, { scale: 2 }))).toEqual({ halfWidth: 1, halfDepth: 0.6, height: 1.5 });
  });

  it('uses defaults for unmeasured models', () => {
    const raw = item('a', 0, 0, { halfWidth: undefined, halfDepth: undefined, height: undefined });
    expect(itemSizes(raw).halfWidth).toBeCloseTo(0.4);
  });

  it('treats very low items as flat floor coverings', () => {
    expect(isFlatItem(item('rug', 0, 0, { height: 0.02 }))).toBe(true);
    expect(isFlatItem(item('desk', 0, 0))).toBe(false);
  });

  it('builds footprints from position and rotation', () => {
    const fp = furnitureFootprint(item('a', 1, -1, { rotation: [0, 0.5, 0] }));
    expect(fp.center).toEqual([1, -1]);
    expect(fp.angle).toBe(0.5);
    expect(partitionFootprint(wall(0, 0)).half).toEqual([1, 0.05]);
  });
});

describe('resolvePlacement', () => {
  it('keeps items inside the room', () => {
    const result = resolvePlacement(furnitureSubject(item('a', 5, 5)), rect, [], free);
    const b = obbBounds(result.footprint);
    expect(b.maxX).toBeLessThanOrEqual(2 + 1e-6);
    expect(b.maxZ).toBeLessThanOrEqual(2 + 1e-6);
    expect(result.valid).toBe(true);
  });

  it('pushes items out of partitions', () => {
    const obstacles = buildObstacles([wall(0, 0)], []);
    const result = resolvePlacement(furnitureSubject(item('a', 0.2, 0.1)), rect, obstacles, free);
    expect(result.valid).toBe(true);
    expect(obbOverlap(result.footprint, obstacles[0].footprint).overlapping).toBe(false);
  });

  it('pushes items out of other furniture but lets rugs overlap', () => {
    const others = [item('b', 0, 0)];
    const desk = resolvePlacement(furnitureSubject(item('a', 0.3, 0)), rect, buildObstacles([], others), free);
    expect(desk.valid).toBe(true);
    expect(obbOverlap(desk.footprint, furnitureFootprint(others[0])).overlapping).toBe(false);
    // Выталкивание по кратчайшей оси: по Z глубина 0.6 м меньше, чем 0.7 м по X.
    expect(Math.abs(desk.footprint.center[1])).toBeCloseTo(0.6, 3);

    const rug = resolvePlacement(furnitureSubject(item('rug', 0.1, 0, { height: 0.02 })), rect, buildObstacles([], others), free);
    expect(rug.footprint.center).toEqual([0.1, 0]);
  });

  it('ignores furniture when asked', () => {
    const result = resolvePlacement(furnitureSubject(item('a', 0.3, 0)), rect, buildObstacles([], [item('b', 0, 0)]), {
      ...free,
      ignoreFurniture: true,
    });
    expect(result.footprint.center).toEqual([0.3, 0]);
  });

  it('allows stacking in height (shelf above a desk)', () => {
    const shelf = item('shelf', 0, 0, { position: [0, 1.2, 0], height: 0.3 });
    const result = resolvePlacement(furnitureSubject(shelf), rect, buildObstacles([], [item('desk', 0, 0)]), free);
    expect(result.footprint.center).toEqual([0, 0]);
  });

  it('snaps to the grid', () => {
    const result = resolvePlacement(furnitureSubject(item('a', 0.33, -0.27)), rect, [], { gridStep: 0.25, wallMagnet: 0 });
    expect(result.footprint.center[0]).toBeCloseTo(0.25);
    expect(result.footprint.center[1]).toBeCloseTo(-0.25);
  });

  it('reports invalid placement when the item cannot fit', () => {
    const corridor = [wall(-0.6, 0, Math.PI / 2, 4), wall(0.6, 0, Math.PI / 2, 4)];
    const huge = item('a', 0, 0, { halfWidth: 1.5, halfDepth: 1.5 });
    const result = resolvePlacement(furnitureSubject(huge), rect, buildObstacles(corridor, []), free);
    expect(result.valid).toBe(false);
  });
});

describe('wall magnet', () => {
  it('pulls items flush to the nearest wall', () => {
    const near = furnitureFootprint(item('a', 1.4, 0));
    const { footprint, side } = snapToWalls(near, rect, 0.15);
    expect(side).toBe('right');
    expect(obbBounds(footprint).maxX).toBeCloseTo(2);
  });

  it('snaps into corners on both axes', () => {
    const near = furnitureFootprint(item('a', 1.45, -1.65));
    const { footprint } = snapToWalls(near, rect, 0.15);
    const b = obbBounds(footprint);
    expect(b.maxX).toBeCloseTo(2);
    expect(b.minZ).toBeCloseTo(-2);
  });

  it('does nothing when disabled or far from walls', () => {
    const fp = furnitureFootprint(item('a', 0, 0));
    expect(snapToWalls(fp, rect, 0).side).toBeNull();
    expect(snapToWalls(fp, rect, 0.15).footprint).toEqual(fp);
  });
});

describe('free spot search and orientation', () => {
  it('finds a free spot next to an occupied one', () => {
    const others = [item('b', 0, 0)];
    const spot = findFreeSpot(furnitureSubject(item('a', 0, 0)), rect, buildObstacles([], others), free);
    expect(spot).not.toBeNull();
    expect(isPlacementFree({ ...furnitureSubject(item('a', 0, 0)), footprint: spot! }, rect, buildObstacles([], others), free)).toBe(true);
  });

  it('returns null when the room is full', () => {
    const blocker = item('b', 0, 0, { halfWidth: 2, halfDepth: 2 });
    expect(findFreeSpot(furnitureSubject(item('a', 0, 0)), rect, buildObstacles([], [blocker]), free)).toBeNull();
  });

  it('faces items into the room near walls', () => {
    expect(facingRoomAngle('back', dims)).toBeCloseTo(0);
    expect(facingRoomAngle('front', dims)).toBeCloseTo(Math.PI);
    expect(autoOrientAngle([1.7, 0], 0.3, dims)).toBeCloseTo(-Math.PI / 2);
    expect(autoOrientAngle([0, 0], 0.3, dims)).toBeNull();
  });
});
