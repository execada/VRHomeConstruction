import { describe, expect, it } from 'vitest';
import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { detectRooms, insetPolygon, roomAt } from './rooms';
import type { Partition } from '../types';

const dims = { width: 6, height: 3, depth: 4 };

function wall(id: string, a: Vec2, b: Vec2, thickness = 0.1): Partition {
  const d = sub2(b, a);
  return {
    id,
    position: [(a[0] + b[0]) / 2, 1.5, (a[1] + b[1]) / 2],
    rotation: [0, Math.atan2(-d[1], d[0]), 0],
    size: [length2(d), 3, thickness],
    openings: [],
  };
}

const areas = (rooms: ReturnType<typeof detectRooms>) => rooms.map((r) => Number(r.area.toFixed(4)));

describe('detectRooms', () => {
  it('returns the whole apartment when there are no interior walls', () => {
    const [room, ...rest] = detectRooms({ width: 4, height: 3, depth: 3 }, []);
    expect(rest).toHaveLength(0);
    expect(room.area).toBeCloseTo(12);
    expect(room.perimeter).toBeCloseTo(14);
    expect(room.center[0]).toBeCloseTo(0, 1);
  });

  it('splits the space with a wall and subtracts its thickness', () => {
    const rooms = detectRooms(dims, [wall('w', [0, -2], [0, 2])]);
    expect(areas(rooms)).toEqual([11.8, 11.8]);
  });

  it('splits further with a T joint', () => {
    const rooms = detectRooms(dims, [wall('w', [0, -2], [0, 2]), wall('t', [0, 0], [3, 0])]);
    expect(areas(rooms).sort()).toEqual([11.8, 5.7525, 5.7525].sort());
  });

  it('does not split the room with a dangling wall but subtracts its footprint', () => {
    const rooms = detectRooms(dims, [wall('d', [-3, 0], [-1, 0])]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(24 - 0.2);
  });

  it('subtracts free-standing walls and islands', () => {
    expect(detectRooms(dims, [wall('f', [-1, 0], [1, 0])])[0].area).toBeCloseTo(23.8);
    const box = [
      wall('a', [-1, -1], [1, -1]),
      wall('b', [1, -1], [1, 1]),
      wall('c', [1, 1], [-1, 1]),
      wall('d', [-1, 1], [-1, -1]),
    ];
    const rooms = detectRooms(dims, box);
    expect(areas(rooms).sort((x, y) => x - y)).toEqual([3.61, 19.59]);
    const closet = roomAt(rooms, [0, 0])!;
    expect(closet.area).toBeCloseTo(3.61);
    const outerRoom = roomAt(rooms, [2.5, 1.5])!;
    expect(outerRoom.holes).toHaveLength(1);
    expect(roomAt(rooms, [1, 0])).toBe(null);
  });

  it('handles slanted walls', () => {
    const w = wall('s', [-3, -2], [3, 2]);
    const rooms = detectRooms(dims, [w]);
    expect(rooms).toHaveLength(2);
    // Полоса стены обрезана внешними стенами в углах, поэтому теряется чуть меньше L·t.
    const total = rooms[0].area + rooms[1].area;
    expect(total).toBeGreaterThan(24 - w.size[0] * 0.1);
    expect(total).toBeLessThan(24 - w.size[0] * 0.1 + 0.02);
  });

  it('orders rooms top-down and keeps label points inside', () => {
    const rooms = detectRooms(dims, [wall('h', [-3, 0], [3, 0])]);
    expect(rooms[0].center[1]).toBeLessThan(rooms[1].center[1]);
    rooms.forEach((r) => expect(roomAt(rooms, r.center)).toBe(r));
  });
});

describe('insetPolygon', () => {
  it('offsets edges inwards by their own distance', () => {
    const square: Vec2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const inner = insetPolygon(square, [0.1, 0, 0.1, 0]);
    expect(inner).toEqual([[0, 0.1], [2, 0.1], [2, 1.9], [0, 1.9]].map(([x, z]) => [expect.closeTo(x), expect.closeTo(z)]));
  });
});
