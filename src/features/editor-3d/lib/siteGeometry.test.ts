import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { backdropSphere, tiledDisk, tiledPlane } from './siteGeometry';

function uvRange(geometry: { getAttribute: (name: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number } }) {
  const uv = geometry.getAttribute('uv');
  const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
  return { u: Math.max(...us) - Math.min(...us), v: Math.max(...vs) - Math.min(...vs) };
}

describe('site geometry', () => {
  it('repeats a 2 m tile across the whole disk instead of stretching it', () => {
    const range = uvRange(tiledDisk(100, 2, 16));
    expect(range.u).toBeCloseTo(100, 5);
    expect(range.v).toBeCloseTo(100, 5);
  });

  it('tiles a plane by its own size', () => {
    const range = uvRange(tiledPlane(27, 14.4, 12, 14.4));
    expect(range.u).toBeCloseTo(27 / 12, 5);
    expect(range.v).toBeCloseTo(1, 5);
  });

  it('maps directions on the backdrop like the three.js equirect background', () => {
    const sphere = backdropSphere(64, 32);
    const position = sphere.getAttribute('position');
    const uv = sphere.getAttribute('uv');
    const v = new Vector3();
    for (const i of [70, 200, 900, 1500]) {
      v.fromBufferAttribute(position, i).normalize();
      if (Math.abs(v.y) > 0.95) continue;
      const expected = (Math.atan2(v.z, v.x) / (2 * Math.PI) + 0.5 + 1) % 1;
      const actual = uv.getX(i) % 1;
      const distance = Math.min(Math.abs(expected - actual), 1 - Math.abs(expected - actual));
      expect(distance).toBeLessThan(1e-6);
    }
  });
});
