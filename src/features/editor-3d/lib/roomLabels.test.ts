import { describe, expect, it } from 'vitest';
import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { nameRooms, reanchorRoomLabels, ROOM_NAME_MAX, ROOM_NAME_PRESETS, totalArea, upsertRoomLabel } from './roomLabels';
import { detectRooms, roomAt } from './rooms';
import type { Partition, RoomLabel } from '../types';

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

const divided = () => detectRooms(dims, [wall('w', [1, -2], [1, 2])]);

describe('nameRooms', () => {
  it('names a single room and numbers several', () => {
    expect(nameRooms(detectRooms(dims, []), []).map((r) => r.name)).toEqual(['Комната']);
    expect(nameRooms(divided(), []).map((r) => r.name)).toEqual(['Комната 1', 'Комната 2']);
  });

  it('applies labels by their anchor point', () => {
    const labels: RoomLabel[] = [{ id: 'l1', name: 'Лоджия', anchor: [2, 0], kind: 'loggia' }];
    const rooms = nameRooms(divided(), labels);
    const loggia = rooms.find((r) => r.labelId === 'l1')!;
    expect(loggia.kind).toBe('loggia');
    expect(loggia.key).toBe('l1');
    expect(rooms.find((r) => r.labelId === null)!.name).toBe('Комната 1');
  });
});

describe('room labels', () => {
  it('creates a label on rename and updates it afterwards', () => {
    const [room] = nameRooms(divided(), []);
    const labels = upsertRoomLabel([], room, { name: '  Кухня  ' }, 'new');
    expect(labels).toEqual([{ id: 'new', name: 'Кухня', kind: 'room', anchor: [room.center[0], room.center[1]] }]);
    const [named] = nameRooms(divided(), labels);
    const renamed = upsertRoomLabel(labels, named, { kind: 'balcony' }, 'unused');
    expect(renamed).toEqual([{ ...labels[0], kind: 'balcony' }]);
    expect(upsertRoomLabel(labels, named, { name: '   ' }, 'x')[0].name).toBe('Кухня');
  });

  it('offers name presets that fit the name limit', () => {
    expect(ROOM_NAME_PRESETS.every((n) => n.length > 0 && n.length <= ROOM_NAME_MAX)).toBe(true);
  });

  it('computes the total area with loggia and balcony coefficients', () => {
    expect(totalArea([{ area: 20, kind: 'room' }, { area: 4, kind: 'loggia' }, { area: 10, kind: 'balcony' }])).toBeCloseTo(25);
  });

  it('moves labels back into rooms after walls change', () => {
    const rooms = divided();
    const inside: RoomLabel = { id: 'a', name: 'Спальня', anchor: [2.9, 1.9] };
    const lost: RoomLabel = { id: 'b', name: 'Кухня', anchor: [1, 0] };
    const [first, second] = reanchorRoomLabels([inside, lost], rooms);
    expect(roomAt(rooms, first.anchor)).toBe(roomAt(rooms, [2.9, 1.9]));
    expect(first.anchor).not.toEqual(inside.anchor);
    const target = roomAt(rooms, second.anchor)!;
    expect(target).not.toBe(roomAt(rooms, first.anchor));
    expect(reanchorRoomLabels([inside], [])).toEqual([inside]);
  });
});
