import { describe, expect, it } from 'vitest';
import { obbOverlap } from '@/shared/lib/math/geometry2d';
import { buildObstacles, partitionFootprint } from '../placement';
import type { Partition, Stair } from '../../types';
import { autoStairAngle, clampStair, cutoutObstacle, findStairSpot, floorFixtures, resolveStair, stairObstacle } from './stairPlacement';
import { stairFootprint, stairLayout } from './stairs';

const room = { width: 8, height: 3, depth: 7 };
const stair = (patch: Partial<Stair> = {}): Stair => ({ id: 's', kind: 'straight', position: [0, 0], rotation: 0, width: 1, ...patch });
const layout = stairLayout('straight', 3.3);
const options = { gridStep: null, wallMagnet: 0.12 };
const wall: Partition = { id: 'p', position: [0, 1.5, 0], rotation: [0, Math.PI / 2, 0], size: [7, 3, 0.1], openings: [] };

describe('расстановка лестниц', () => {
  it('лестница вдоль ближайшей стены', () => {
    expect(autoStairAngle([-3.5, 0], room)).toBe(0);
    expect(autoStairAngle([0, -3.2], room)).toBeCloseTo(-Math.PI / 2);
  });

  it('прижимается к стене и не заходит в перегородку', () => {
    const placed = resolveStair(stair({ position: [-3.45, 0] }), layout, room, [], options);
    expect(placed.valid).toBe(true);
    expect(placed.stair.position[0]).toBeCloseTo(-3.5);
    const blocked = resolveStair(stair({ position: [0, 0] }), layout, room, buildObstacles([wall], []), options);
    expect(obbOverlap(stairFootprint(blocked.stair, layout), partitionFootprint(wall)).overlapping).toBe(false);
  });

  it('ищет свободное место и сообщает, если места нет', () => {
    const spot = findStairSpot(stair(), layout, room, buildObstacles([wall], []), options);
    expect(spot).not.toBeNull();
    expect(findStairSpot(stair(), layout, { width: 3, height: 3, depth: 3 }, [], options)).toBeNull();
  });

  it('препятствия этажа: лестницы (кроме перемещаемой) и вырезы — на всю высоту', () => {
    const fixtures = floorFixtures([stair({ id: 'a' }), stair({ id: 'b', position: [2, 0] })], 3.3, [{ minX: -1, maxX: 1, minZ: -2, maxZ: 2 }], 3, 'a');
    expect(fixtures.map((f) => f.id)).toEqual(['b', 'cutout-0']);
    expect(fixtures.every((f) => f.kind === 'partition' && f.yRange[1] === 3)).toBe(true);
    expect(stairObstacle(stair(), layout, 3).footprint.half[1]).toBeCloseTo(layout.length / 2);
    expect(cutoutObstacle({ minX: 0, maxX: 2, minZ: 0, maxZ: 4 }, 3, 3).footprint).toEqual({ center: [1, 2], half: [1, 2], angle: 0 });
  });

  it('после изменения размеров этажа лестница остаётся в комнате', () => {
    const clamped = clampStair(stair({ position: [5, 0] }), layout, room);
    expect(clamped.position[0]).toBeCloseTo(3.5);
  });
});
