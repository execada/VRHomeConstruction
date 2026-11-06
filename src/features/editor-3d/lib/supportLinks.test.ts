import { describe, expect, it } from 'vitest';
import type { FurnitureItem } from '@/features/furniture/types';
import { furnitureRole } from './supportRole';
import {
  carrySupported,
  carryWith,
  inferSupportLinks,
  itemsOn,
  normalizeSupportLinks,
  repairSupportLinks,
  stackLevel,
  withCarried,
  withoutSupport,
} from './supportLinks';

const item = (id: string, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: 'primitive:desk',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  ...extra,
});

const desk = item('desk', { name: 'Письменный стол', halfWidth: 0.7, halfDepth: 0.35, height: 0.75 });
const lamp = item('lamp', {
  name: 'Настольная лампа',
  modelPath: '/assets/models/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf',
  position: [0.4, 0.75, 0.1],
  rotation: [0, 0.3, 0],
  halfWidth: 0.1,
  halfDepth: 0.3,
  height: 0.9,
  supportId: 'desk',
});

describe('carrying items with their support', () => {
  it('moves, turns and lifts an item together with its support', () => {
    const after = { ...desk, position: [1, 0.2, -1] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number] };
    const carried = carryWith(lamp, desk, after);
    // смещение (0.4, 0.1) повёрнуто на 90°: (x, z) → (z, −x)
    expect(carried.position[0]).toBeCloseTo(1.1);
    expect(carried.position[2]).toBeCloseTo(-1.4);
    expect(carried.position[1]).toBeCloseTo(0.95);
    expect(carried.rotation[1]).toBeCloseTo(0.3 + Math.PI / 2);
    expect(carried.supportId).toBe('desk');
  });

  it('scales the offset and the height above the support with its scale', () => {
    const carried = carryWith(lamp, desk, { ...desk, scale: 2 });
    expect(carried.position).toEqual([0.8, 1.5, 0.2]);
  });

  it('updates only items on supports that changed', () => {
    const book = item('book', { supportId: 'shelf', position: [3, 1, 3] });
    const shelf = item('shelf', { position: [3, 0, 3] });
    const before = [desk, lamp, shelf, book];
    const after = [{ ...desk, position: [0.5, 0, 0] as [number, number, number] }, lamp, shelf, book];
    const result = carrySupported(before, after);
    expect(result[1].position[0]).toBeCloseTo(0.9);
    expect(result[3]).toBe(book);
    expect(carrySupported(before, before)).toEqual(before);
  });

  it('applies new floor positions and carries the items standing on moved supports', () => {
    const chair = item('chair', { position: [2, 0, 2] });
    const result = withCarried([desk, lamp, chair], [{ ...desk, position: [0, 0, 1] }, { ...chair, position: [1.5, 0, 2] }]);
    expect(result.map((i) => i.id)).toEqual(['desk', 'lamp', 'chair']);
    expect(result[1].position).toEqual([0.4, 0.75, 1.1]);
    expect(result[2].position[0]).toBe(1.5);
  });

  it('lists items on a support and their stack level', () => {
    expect(itemsOn([desk, lamp, item('x')], 'desk')).toEqual([lamp]);
    expect(stackLevel(lamp)).toBe(1);
    expect(stackLevel(desk)).toBe(0);
    expect(withoutSupport(lamp)).not.toHaveProperty('supportId');
  });
});

describe('repairSupportLinks', () => {
  it('puts items whose support is missing on the floor', () => {
    const [orphan] = repairSupportLinks([lamp]);
    expect(orphan.supportId).toBeUndefined();
    expect(orphan.position).toEqual([0.4, 0, 0.1]);
  });

  it('a cushion that lost its sofa lies on the floor without its seat and tilt', () => {
    const cushion = item('c', { supportId: 'gone', socket: 'back-1', position: [0, 0.38, 0], rotation: [-0.26, 0.5, 0] });
    const [down] = repairSupportLinks([cushion]);
    expect(down.supportId).toBeUndefined();
    expect(down.socket).toBeUndefined();
    expect(down.rotation).toEqual([0, 0.5, 0]);
    expect(down.position).toEqual([0, 0, 0]);
    // Место без опоры — тоже снимается
    const [loose] = repairSupportLinks([item('d', { socket: 'seat-1', rotation: [-1.5, 0, 0] })]);
    expect(loose.socket).toBeUndefined();
    expect(loose.rotation[0]).toBe(0);
  });

  it('drops self links and chains but keeps positions', () => {
    const self = item('a', { supportId: 'a', position: [0, 0.5, 0] });
    const onLamp = item('b', { supportId: 'lamp', position: [0, 1.65, 0] });
    const repaired = repairSupportLinks([desk, lamp, self, onLamp]);
    expect(repaired[1]).toBe(lamp);
    expect(repaired[2]).toEqual(withoutSupport(self));
    expect(repaired[3]).toEqual(withoutSupport(onLamp));
  });
});

describe('inferSupportLinks', () => {
  const resting = withoutSupport(lamp);

  it('links surface items that already stand on top of a support', () => {
    expect(inferSupportLinks([desk, resting])[1].supportId).toBe('desk');
  });

  it('leaves floating, floor-standing and outside items alone', () => {
    const floating = { ...resting, position: [0.4, 0.82, 0.1] as [number, number, number] };
    const outside = { ...resting, position: [2, 0.75, 0] as [number, number, number] };
    const chair = item('chair', { name: 'Стул', modelPath: 'primitive:stool', position: [0, 0.75, 0], halfWidth: 0.2, halfDepth: 0.2, height: 0.5 });
    const items = [desk, floating, outside, chair, { ...resting, id: 'floor', position: [0, 0, 0] as [number, number, number] }];
    expect(inferSupportLinks(items).every((i) => !i.supportId)).toBe(true);
  });

  it('repairs, then infers', () => {
    const normalized = normalizeSupportLinks([desk, resting, item('ghost', { supportId: 'nope', position: [1, 1, 1] })]);
    expect(normalized[1].supportId).toBe('desk');
    expect(normalized[2].position[1]).toBe(0);
  });
});

describe('furnitureRole', () => {
  it('classifies scene items by name, path and model sizes', () => {
    expect(furnitureRole(desk)).toBe('support');
    expect(furnitureRole(lamp)).toBe('surface');
    expect(furnitureRole(item('plant', { name: 'Растение в кашпо', modelPath: '/assets/models/potted_plant_01/potted_plant_01_1k.gltf' }))).toBe('floor');
    expect(furnitureRole(lamp)).toBe('surface');
  });
});
