import { describe, expect, it } from 'vitest';
import type { FurnitureItem } from '@/features/furniture/types';
import { withSill } from './openings';
import { createPartition, partitionEndpoints, partitionFromEndpoints } from './partitions';
import { anchorForDraggedWall, resizeRoom, resizeShift, type RoomContent } from './roomResize';
import { wallFrame, wallToWorld } from './walls';

const dims = { width: 4, height: 3, depth: 4 };

const sofa = (x: number, z: number): FurnitureItem => ({
  id: `f_${x}_${z}`,
  name: 'Диван',
  modelPath: 'primitive:sofa',
  position: [x, 0, z],
  rotation: [0, 0, 0],
  scale: 1,
  halfWidth: 0.4,
  halfDepth: 0.4,
  height: 0.8,
});

const content = (): RoomContent => ({
  dimensions: dims,
  openings: {
    back: [withSill({ id: 'w', wallId: 'back', type: 'window', position: [1, 0], width: 1, height: 1.2 }, 0.9)],
    front: [withSill({ id: 'd', wallId: 'front', type: 'door', position: [0, 0], width: 0.9, height: 2.1 }, 0)],
  },
  partitions: [createPartition({ id: 'p', center: [-1, 0], angle: Math.PI / 2, dims })],
  furniture: [sofa(1.4, 1.4)],
});

describe('resizeShift', () => {
  it('keeps the left wall fixed when the right wall is dragged', () => {
    expect(resizeShift(dims, { ...dims, width: 6 }, anchorForDraggedWall('right'))).toEqual([-1, 0]);
  });

  it('keeps the back wall fixed when the front wall is dragged', () => {
    expect(resizeShift(dims, { ...dims, depth: 3 }, anchorForDraggedWall('front'))).toEqual([0, 0.5]);
  });

  it('does not shift for symmetric resizing', () => {
    expect(resizeShift(dims, { ...dims, width: 8 }, {})).toEqual([0, 0]);
  });

  it('maps every side to its opposite anchor', () => {
    expect(anchorForDraggedWall('left')).toEqual({ x: 'right' });
    expect(anchorForDraggedWall('back')).toEqual({ z: 'front' });
  });
});

describe('resizeRoom', () => {
  it('keeps furniture at the same distance from the fixed wall', () => {
    const before = content();
    const after = resizeRoom(before, { ...dims, width: 6 }, anchorForDraggedWall('right'));
    const gapBefore = before.furniture[0].position[0] - -2;
    const gapAfter = after.furniture[0].position[0] - -3;
    expect(gapAfter).toBeCloseTo(gapBefore);
  });

  it('keeps openings at the same world position', () => {
    const before = content();
    const after = resizeRoom(before, { ...dims, width: 6 }, anchorForDraggedWall('right'));
    const worldBefore = wallToWorld(wallFrame('back', dims), before.openings.back[0].position[0], 0);
    const worldAfter = wallToWorld(wallFrame('back', after.dimensions), after.openings.back[0].position[0], 0);
    expect(worldAfter[0] - -3).toBeCloseTo(worldBefore[0] - -2);
  });

  it('pulls furniture back inside when the room shrinks', () => {
    const after = resizeRoom(content(), { ...dims, width: 3, depth: 3 });
    const item = after.furniture[0];
    expect(item.position[0] + 0.4).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(item.position[2] + 0.4).toBeLessThanOrEqual(1.5 + 1e-6);
  });

  it('makes full-height partitions follow the new ceiling height', () => {
    const after = resizeRoom(content(), { ...dims, height: 2.6 });
    expect(after.partitions[0].size[1]).toBeCloseTo(2.6);
  });

  it('keeps interior walls attached to the outer walls they touched', () => {
    const across = partitionFromEndpoints(createPartition({ id: 'x', center: [0, 0], dims }), [0.5, -2], [0.5, 2], dims);
    const before: RoomContent = { ...content(), partitions: [across], rooms: [{ id: 'r', name: 'Кухня', anchor: [1, 1] }] };
    const after = resizeRoom(before, { ...dims, depth: 5 }, anchorForDraggedWall('front'));
    const [a, b] = partitionEndpoints(after.partitions[0]);
    expect(a[1]).toBeCloseTo(-2.5);
    expect(b[1]).toBeCloseTo(2.5);
    expect(after.partitions[0].size[0]).toBeCloseTo(5);
    expect(after.rooms?.[0].anchor).toEqual([1, expect.closeTo(0.5)]);
  });

  it('keeps door sills on the floor when the height changes', () => {
    const after = resizeRoom(content(), { ...dims, height: 2.5 });
    const door = after.openings.front[0];
    expect(door.position[1] - door.height / 2).toBeCloseTo(0);
  });
});

describe('resizeRoom: проём лестницы снизу', () => {
  it('мебель, оказавшаяся над вырезом, выталкивается из него', () => {
    const dims = { width: 6, height: 3, depth: 6 };
    const sofa = { id: 's', name: 'Диван', modelPath: 'primitive:sofa', position: [1, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1, halfWidth: 0.9, halfDepth: 0.43, height: 0.85 };
    const cutout = { minX: 0, maxX: 2, minZ: -1, maxZ: 1 };
    const result = resizeRoom({ dimensions: dims, openings: {}, partitions: [], furniture: [sofa], cutouts: [cutout] }, dims);
    const [moved] = result.furniture;
    const half = 0.9;
    const overlapsX = moved.position[0] + half > cutout.minX && moved.position[0] - half < cutout.maxX;
    const overlapsZ = moved.position[2] + 0.43 > cutout.minZ && moved.position[2] - 0.43 < cutout.maxZ;
    expect(overlapsX && overlapsZ).toBe(false);
  });
});
