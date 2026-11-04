import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOOR,
  DOOR_PARTS,
  DOOR_STYLE_IDS,
  doorFootprints,
  doorLeaves,
  doorStyle,
  hingeForHand,
  hingeHand,
  normalizeDoor,
  type DoorSpec,
} from './doors';

const opening = { width: 0.9, height: 2.1 };
const t = 0.2;

/** Поворот точки вокруг +Y (как в three.js). */
const rotateY = ([x, z]: readonly [number, number], a: number): [number, number] => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

describe('door styles and specs', () => {
  it('has unique styles and a known default', () => {
    expect(new Set(DOOR_STYLE_IDS).size).toBe(DOOR_STYLE_IDS.length);
    expect(DOOR_STYLE_IDS).toContain(DEFAULT_DOOR.style);
    expect(doorStyle('unknown').id).toBe('panel');
  });

  it('normalizes untrusted door parameters', () => {
    expect(normalizeDoor(undefined)).toEqual(DEFAULT_DOOR);
    const broken = { style: 'vault', hinge: 'up', swing: 'sideways', open: 'yes', color: 'red' } as unknown as Partial<DoorSpec>;
    expect(normalizeDoor(broken)).toEqual(DEFAULT_DOOR);
    expect(normalizeDoor({ open: true, color: '#112233' }, { ...DEFAULT_DOOR, hinge: 'end' })).toEqual({
      ...DEFAULT_DOOR,
      hinge: 'end',
      open: true,
      color: '#112233',
    });
  });

  it('maps hinge sides to left/right hands as seen from the swing side', () => {
    expect(hingeHand({ hinge: 'end', swing: 'front' })).toBe('right');
    expect(hingeHand({ hinge: 'start', swing: 'back' })).toBe('right');
    expect(hingeHand({ hinge: 'start', swing: 'front' })).toBe('left');
    for (const swing of ['front', 'back'] as const) {
      for (const hand of ['left', 'right'] as const) expect(hingeHand({ hinge: hingeForHand(hand, swing), swing })).toBe(hand);
    }
  });
});

describe('doorLeaves', () => {
  it('fits a single leaf into the frame, flush with the swing-side face', () => {
    const [leaf] = doorLeaves(opening, DEFAULT_DOOR, t);
    const clear = 0.9 - 2 * DOOR_PARTS.frame - 2 * DOOR_PARTS.gap;
    expect(leaf.width).toBeCloseTo(clear);
    expect(leaf.height).toBeCloseTo(2.1 - DOOR_PARTS.frame - DOOR_PARTS.floorGap);
    expect(leaf.hinge).toEqual([-clear / 2, 0.1]);
    expect(leaf.toLatch).toBe(1);
  });

  it('opens the leaf towards the swing side without entering the wall', () => {
    for (const door of [DEFAULT_DOOR, { ...DEFAULT_DOOR, swing: 'back' as const }, { ...DEFAULT_DOOR, hinge: 'end' as const }]) {
      const [leaf] = doorLeaves(opening, door, t);
      const tip = rotateY([leaf.toLatch * leaf.width, 0], leaf.openSign * DOOR_PARTS.openAngle);
      const swing = door.swing === 'front' ? 1 : -1;
      expect(tip[1] * swing).toBeCloseTo(leaf.width);
      expect(Math.abs(tip[0])).toBeLessThan(1e-9);
    }
  });

  it('splits double doors into two leaves hinged at both jambs', () => {
    const leaves = doorLeaves({ width: 1.6, height: 2.1 }, { ...DEFAULT_DOOR, style: 'double' }, t);
    expect(leaves).toHaveLength(2);
    expect(leaves[0].hinge[0]).toBeLessThan(0);
    expect(leaves[1].hinge[0]).toBeGreaterThan(0);
    expect(leaves[0].toLatch).toBe(1);
    expect(leaves[1].toLatch).toBe(-1);
  });
});

describe('doorFootprints', () => {
  it('lets the player through an empty doorway', () => {
    expect(doorFootprints(opening, undefined, t)).toEqual([]);
  });

  it('blocks the whole opening when the door is closed', () => {
    expect(doorFootprints(opening, DEFAULT_DOOR, t)).toEqual([{ center: [0, 0], half: [0.45, 0.1] }]);
  });

  it('keeps the passage free next to an open leaf', () => {
    const parts = doorFootprints(opening, { ...DEFAULT_DOOR, open: true }, t);
    expect(parts).toHaveLength(3);
    const leaf = parts[2];
    expect(leaf.center[1]).toBeGreaterThan(t / 2);
    const passage = 0.9 - 2 * DOOR_PARTS.frame - 2 * leaf.half[0];
    expect(passage).toBeGreaterThan(0.44);
  });
});
