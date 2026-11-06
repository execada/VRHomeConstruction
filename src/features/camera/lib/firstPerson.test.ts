import { describe, expect, it } from 'vitest';
import { moveDirection, PLAYER_RADIUS, stepPlayer } from './firstPerson';
import { fixedViewPose, orbitLimits, streetView, topViewZoom } from './views';

const room = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };

describe('moveDirection', () => {
  it('moves forward along -Z when looking straight ahead', () => {
    const [x, z] = moveDirection({ forward: 1, right: 0 }, 0);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  it('strafes right along +X', () => {
    const [x, z] = moveDirection({ forward: 0, right: 1 }, 0);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });

  it('normalizes diagonal movement', () => {
    const [x, z] = moveDirection({ forward: 1, right: 1 }, 0.3);
    expect(Math.hypot(x, z)).toBeCloseTo(1);
  });
});

describe('stepPlayer', () => {
  it('stops at room walls', () => {
    const [x] = stepPlayer([1.5, 0], [2, 0], room, []);
    expect(x).toBeCloseTo(2 - PLAYER_RADIUS);
  });

  it('cannot pass through a thin partition even when moving fast', () => {
    const wall = { center: [0, 0] as const, half: [0.05, 2] as const, angle: 0 };
    const [x] = stepPlayer([-1, 0], [3, 0], room, [wall]);
    expect(x).toBeLessThan(0);
  });

  it('slides along obstacles', () => {
    const table = { center: [0, -1] as const, half: [1, 0.3] as const, angle: 0 };
    const [x, z] = stepPlayer([0, 0], [0.5, -1], room, [table]);
    expect(x).toBeGreaterThan(0.2);
    expect(z).toBeGreaterThan(-1);
  });

  it('flies freely without collisions', () => {
    const [x, z] = stepPlayer([0, 0], [5, 0], null, []);
    expect(x).toBeCloseTo(5);
    expect(z).toBeCloseTo(0);
  });
});

describe('camera views', () => {
  const dims = { width: 4, height: 2.7, depth: 5 };

  it('places fixed views outside the room looking at its center', () => {
    expect(fixedViewPose('front', dims).position[2]).toBeGreaterThan(2.5);
    expect(fixedViewPose('back', dims).position[2]).toBeLessThan(-2.5);
    expect(fixedViewPose('left', dims).position[0]).toBeLessThan(-2);
    expect(fixedViewPose('iso', dims).target[1]).toBeGreaterThan(0);
  });

  it('keeps the orbit camera above the floor', () => {
    expect(orbitLimits(dims).maxPolarAngle).toBeLessThan(Math.PI / 2);
  });

  it('places fixed views around the active floor of a building', () => {
    const pose = fixedViewPose('front', dims, { base: 3.3, offset: [1, -2] });
    expect(pose.target).toEqual([1, dims.height * 0.35 + 3.3, -2]);
    expect(pose.position[2]).toBeGreaterThan(-2 + 2.5);
  });

  it('frames the whole building from the street and keeps the camera outside', () => {
    const bounds = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
    const view = streetView(bounds, 7);
    const [tx, ty, tz] = view.pose.target;
    expect([tx, tz]).toEqual([0, 0]);
    expect(ty).toBeCloseTo(7 * 0.45);
    const [px, py, pz] = view.pose.position;
    expect(Math.hypot(px - tx, py - ty, pz - tz)).toBeGreaterThan(view.minDistance);
    expect(view.minDistance).toBeGreaterThan(Math.hypot(16, 10) / 2);
    expect(view.maxPolarAngle).toBeLessThan(Math.PI / 2);
  });

  it('fits the room into the top view', () => {
    const zoom = topViewZoom(dims, { width: 1000, height: 800 });
    expect(zoom * (dims.depth + 2.4)).toBeLessThanOrEqual(800 + 1e-6);
  });
});
