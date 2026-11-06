import { describe, expect, it } from 'vitest';
import { toEditorPayload, createEmptyFloor } from '../scene/build';
import type { FloorContent } from '../../types';
import {
  buildingBounds,
  buildingLot,
  floorAbove,
  floorFrames,
  floorIndexAt,
  floorInterior,
  floorName,
  floorRise,
  floorToWorld,
  roofLevel,
  worldToFloor,
} from './floors';
import { floorSlabs, GROUND_SLAB, hasOpenRoof, roofEdges, stairCutouts } from './slabs';

const content = (width: number, depth: number, height = 3): FloorContent => ({ ...toEditorPayload(createEmptyFloor({ width, height, depth })), furniture: [] });

describe('этажи здания', () => {
  const frames = floorFrames(
    [
      { id: 'a', offset: [0, 0], height: 3.2 },
      { id: 'b', offset: [0, -1.5], height: 3 },
      { id: 'c', offset: [1, 0], height: 2.8 },
    ],
    0.3,
  );

  it('пол каждого этажа — над потолком нижнего плюс перекрытие', () => {
    expect(frames.map((f) => f.base)).toEqual([0, 3.5, expect.closeTo(6.8)]);
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(floorRise(frames[0], 0.3)).toBeCloseTo(3.5);
    expect(roofLevel(frames[2], 0.3)).toBeCloseTo(6.8 + 2.8 + 0.25);
  });

  it('этаж под ногами: по высоте ступней, на террасе чуть ниже пола — уже верхний', () => {
    expect(floorIndexAt(frames, 0)).toBe(0);
    expect(floorIndexAt(frames, 1.8)).toBe(0);
    expect(floorIndexAt(frames, 3.45)).toBe(1);
    expect(floorIndexAt(frames, 7)).toBe(2);
    expect(floorIndexAt(frames, -5)).toBe(0);
  });

  it('переводит точки между координатами этажа и мира', () => {
    expect(floorToWorld(frames[1], [2, 1])).toEqual([2, -0.5]);
    expect(worldToFloor(frames[1], [2, -0.5])).toEqual([2, 1]);
  });

  it('габариты и участок охватывают все этажи', () => {
    const floors = [
      { frame: frames[0], content: content(10, 8) },
      { frame: { ...frames[1], offset: [3, 0] as const }, content: content(10, 8) },
    ];
    const bounds = buildingBounds(floors);
    expect(bounds.minX).toBeCloseTo(-5.2);
    expect(bounds.maxX).toBeCloseTo(8.2);
    expect(floorInterior(floors[1]).minX).toBeCloseTo(-2);
    const lot = buildingLot(floors);
    expect(lot.minX).toBeCloseTo(-11);
    expect(lot.maxX).toBeCloseTo(14);
  });

  it('новый этаж повторяет контур верхнего, но пустой', () => {
    const top = { meta: { id: 'b', name: '2 этаж', offset: [0, -1] as [number, number] }, content: { ...content(9, 7), partitions: [], stairs: [{ id: 's', kind: 'straight' as const, position: [0, 0] as [number, number], rotation: 0, width: 1 }] } };
    const next = floorAbove(top, 2, 'new');
    expect(next.meta).toEqual({ id: 'new', name: '3 этаж', offset: [0, -1] });
    expect(next.content.dimensions).toBe(top.content.dimensions);
    expect(next.content.outerWalls).toBe(top.content.outerWalls);
    expect(next.content.stairs).toEqual([]);
    expect(next.content.furniture).toEqual([]);
    expect(floorName(0)).toBe('1 этаж');
  });
});

describe('перекрытия', () => {
  const frames = floorFrames(
    [
      { id: 'a', offset: [0, 0], height: 3 },
      { id: 'b', offset: [0, -1], height: 3 },
    ],
    0.3,
  );
  const stair = { id: 's', kind: 'straight' as const, position: [-2, 0] as [number, number], rotation: 0, width: 1 };
  const lower = { frame: frames[0], content: { ...content(10, 8), stairs: [stair] } };
  const upper = { frame: frames[1], content: content(10, 6) };

  it('пол первого этажа — плита на грунте, без вырезов', () => {
    const slabs = floorSlabs(lower, null, 0.3);
    expect(slabs.floor.rects).toHaveLength(1);
    expect(slabs.floor.bottom).toBeCloseTo(-GROUND_SLAB);
    expect(slabs.ceiling.bottom).toBe(3);
    expect(slabs.ceiling.top).toBeCloseTo(3.25);
  });

  it('над лестницей вырезан проём: в плите нижнего этажа и в полу верхнего (в его координатах)', () => {
    const own = floorSlabs(lower, null, 0.3).ceiling.rects;
    const cut = stairCutouts(lower.content.stairs, 3.3)[0];
    const area = (rects: typeof own) => rects.reduce((s, r) => s + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
    expect(area(own)).toBeCloseTo(10.4 * 8.4 - (cut.maxX - cut.minX) * (cut.maxZ - cut.minZ));
    const above = floorSlabs(upper, lower, 0.3).floor.rects;
    // Верхний этаж короче (z от −3 до 3 в своих координатах): вырез обрезан по его комнате
    const inUpper = { ...cut, minZ: Math.max(cut.minZ + 1, -3), maxZ: Math.min(cut.maxZ + 1, 3) };
    expect(area(above)).toBeCloseTo(10.4 * 6.4 - (inUpper.maxX - inUpper.minX) * (inUpper.maxZ - inUpper.minZ));
  });

  it('открытая крыша: перед верхним этажом — терраса, у верхнего — весь контур', () => {
    expect(hasOpenRoof(lower, upper)).toBe(true);
    expect(hasOpenRoof(upper, null)).toBe(true);
    expect(hasOpenRoof({ ...lower, content: content(10, 6) }, { ...upper, frame: { ...upper.frame, offset: [0, 0] } })).toBe(false);
    const edges = roofEdges(lower, upper);
    expect(edges.length).toBeGreaterThan(0);
    expect(roofEdges(upper, null)).toHaveLength(4);
  });
});
