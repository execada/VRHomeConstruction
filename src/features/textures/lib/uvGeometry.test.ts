import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { boxWithUv, prismWithUv, roundedEndBox } from './uvGeometry';

describe('boxWithUv', () => {
  it('maps front faces to meters divided by tile size', () => {
    const geometry = boxWithUv([2, 1, 0.2], [1, 0.5, 0], 0.5);
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    const position = geometry.getAttribute('position');
    for (let i = 0; i < uv.count; i += 1) {
      if (Math.abs(normal.getZ(i)) > 0.9) {
        expect(uv.getX(i)).toBeCloseTo((position.getX(i) + 1) / 0.5);
        expect(uv.getY(i)).toBeCloseTo((position.getY(i) + 0.5) / 0.5);
      }
    }
  });

  it('keeps tiling continuous between neighbouring pieces', () => {
    const left = boxWithUv([1, 1, 0.2], [-0.5, 0.5, 0], 1);
    const right = boxWithUv([1, 1, 0.2], [0.5, 0.5, 0], 1);
    const frontU = (g: typeof left) => {
      const uv = g.getAttribute('uv');
      const normal = g.getAttribute('normal');
      return Array.from({ length: uv.count }, (_, i) => i)
        .filter((i) => normal.getZ(i) > 0.9)
        .map((i) => uv.getX(i));
    };
    expect(Math.max(...frontU(left))).toBeCloseTo(Math.min(...frontU(right)));
  });
});

describe('roundedEndBox', () => {
  it('falls back to a plain box without radius', () => {
    expect(roundedEndBox([2, 2.7, 0.1], 0, { start: true, end: true }, [0, 0, 0], 1).type).toBe('BoxGeometry');
  });

  it('builds a centered extruded shape with the requested size', () => {
    const geometry = roundedEndBox([2, 2.7, 0.2], 0.1, { start: true, end: true }, [0, 0, 0], 1);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    expect(box.max.x - box.min.x).toBeCloseTo(2);
    expect(box.max.y - box.min.y).toBeCloseTo(2.7);
    expect(box.max.z - box.min.z).toBeCloseTo(0.2);
    expect(box.min.y).toBeCloseTo(-1.35);
    expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
  });
});

describe('prismWithUv', () => {
  const trapezoid = [[0, -0.1], [2, -0.1], [2.2, 0.1], [0, 0.1]] as const;

  it('builds a closed prism with outward normals and two material groups', () => {
    const geometry = prismWithUv(trapezoid, 0, 2.7, 1, 0.5);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(2.7);
    expect(box.max.x).toBeCloseTo(2.2);
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    // Внешние нормали: от центра основания наружу.
    for (let i = 0; i < position.count; i += 1) {
      const dx = position.getX(i) - 1.05;
      const dz = position.getZ(i);
      const dy = position.getY(i) - 1.35;
      expect(dx * normal.getX(i) + dy * normal.getY(i) + dz * normal.getZ(i)).toBeGreaterThan(-1e-6);
    }
  });

  it('uses the top tile on the top face only', () => {
    const geometry = prismWithUv([[0, 0], [1, 0], [1, 1], [0, 1]], 0, 1, 1, 0.5);
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    const position = geometry.getAttribute('position');
    for (let i = 0; i < uv.count; i += 1) {
      if (normal.getY(i) > 0.5) expect(uv.getX(i)).toBeCloseTo(position.getX(i) / 0.5);
      if (normal.getY(i) < -0.5) expect(uv.getX(i)).toBeCloseTo(position.getX(i));
    }
  });

  it('handles clockwise outlines', () => {
    const geometry = prismWithUv([...trapezoid].reverse(), 0, 1, 1);
    expect(geometry.getAttribute('position').count).toBe(4 * 6 + 2 * 2 * 3);
  });
});
