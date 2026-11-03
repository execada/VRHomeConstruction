import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { PLAYER_RADIUS, stepPlayer } from '@/features/camera/lib/firstPerson';
import { uniformOuterWalls } from '../constants';
import { DEFAULT_DOOR } from './doors';
import { withSill } from './openings';
import { createPartition, partitionFromEndpoints } from './partitions';
import { analyzeWalls } from './wallJoints';
import { walkObstacles, type WalkScene } from './walkObstacles';
import type { Opening } from '../types';

const dims = { width: 4, height: 2.7, depth: 4 };
const outside = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };

const door = (wallId: string, extra: Partial<Opening> = {}): Opening =>
  withSill({ id: 'd', wallId, type: 'door', position: [0, 0], width: 0.9, height: 2.1, ...extra }, 0);

function scene(patch: Partial<WalkScene> = {}): WalkScene {
  return { dimensions: dims, outerWalls: uniformOuterWalls(0.2), removedWalls: [], openings: {}, partitions: [], ...patch };
}

/** Пройти от точки на расстояние вдоль оси Z. */
function walk(s: WalkScene, from: Vec2, dz: number): Vec2 {
  return stepPlayer(from, [0, dz], outside, walkObstacles(s, analyzeWalls(s.dimensions, s.partitions)));
}

describe('walkObstacles: outer walls', () => {
  it('keeps the player inside a closed room', () => {
    expect(walk(scene(), [0, 0], -5)[1]).toBeCloseTo(-2 + PLAYER_RADIUS, 2);
  });

  it('lets the player out through an empty doorway or an open door, not a closed one', () => {
    expect(walk(scene({ openings: { back: [door('back')] } }), [0, 0], -5)[1]).toBeLessThan(-2.5);
    expect(walk(scene({ openings: { back: [door('back', { door: { ...DEFAULT_DOOR, open: true } })] } }), [0, 0], -5)[1]).toBeLessThan(-2.5);
    expect(walk(scene({ openings: { back: [door('back', { door: DEFAULT_DOOR })] } }), [0, 0], -5)[1]).toBeGreaterThan(-2);
  });

  it('treats windows as solid, including floor-to-ceiling glazing', () => {
    const window = withSill({ id: 'w', wallId: 'back', type: 'window', position: [0, 0], width: 2, height: 2.7 }, 0);
    expect(walk(scene({ openings: { back: [window] } }), [0, 0], -5)[1]).toBeGreaterThan(-2);
  });

  it('opens the side of a removed wall', () => {
    expect(walk(scene({ removedWalls: ['back'] }), [0, 0], -5)[1]).toBeLessThan(-2.5);
  });
});

describe('walkObstacles: interior walls', () => {
  const across = () => partitionFromEndpoints(createPartition({ id: 'p', center: [0, 0], dims }), [-2, 0], [2, 0], dims);

  it('separates rooms with an interior wall', () => {
    expect(walk(scene({ partitions: [across()] }), [0, 1], -3)[1]).toBeGreaterThan(0);
  });

  it('lets the player pass a doorway between rooms depending on the door', () => {
    const withDoor = (d?: Opening['door']) => scene({ partitions: [{ ...across(), openings: [door('p', { door: d })] }] });
    expect(walk(withDoor(undefined), [0, 1], -2)[1]).toBeCloseTo(-1, 1);
    expect(walk(withDoor({ ...DEFAULT_DOOR, open: true }), [0.1, 1], -2)[1]).toBeCloseTo(-1, 1);
    expect(walk(withDoor(DEFAULT_DOOR), [0, 1], -2)[1]).toBeGreaterThan(0);
  });
});
