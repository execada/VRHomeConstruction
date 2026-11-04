import { describe, expect, it } from 'vitest';
import { scanSurfaces, type ModelSurface } from './surfaceScan';

type Box = { min: [number, number, number]; max: [number, number, number] };

/** Треугольники бокса с внешними нормалями (обход против часовой стрелки снаружи). */
function boxTriangles({ min, max }: Box, flip = false): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const quads: number[][][] = [
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], // верх (+Y)
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // низ (−Y)
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // перед (+Z)
    [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], // зад (−Z)
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], // право (+X)
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // лево (−X)
  ];
  return quads.flatMap(([a, b, c, d]) => {
    const tris = [[a, b, c], [a, c, d]];
    return tris.flatMap((t) => (flip ? [t[0], t[2], t[1]] : t).flat());
  });
}

const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Box => ({
  min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
  max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
});

const near = (value: number, expected: number, tolerance = 0.02) => Math.abs(value - expected) <= tolerance;
const covers = (s: ModelSurface, minX: number, maxX: number, minZ: number, maxZ: number) =>
  near(s.minX, minX) && near(s.maxX, maxX) && near(s.minZ, minZ) && near(s.maxZ, maxZ);

describe('scanSurfaces', () => {
  it('finds the top of a desk and ignores touching parts below it', () => {
    const desk = [
      box(0, 0.725, 0, 1.4, 0.05, 0.7),
      box(-0.675, 0.35, 0, 0.05, 0.7, 0.7),
      box(0.675, 0.35, 0, 0.05, 0.7, 0.7),
      box(0.47, 0.5, 0, 0.4, 0.45, 0.65),
    ].flatMap((b) => boxTriangles(b));
    const surfaces = scanSurfaces(desk);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].y).toBeCloseTo(0.75, 3);
    expect(surfaces[0].clearance).toBe(Infinity);
    expect(covers(surfaces[0], -0.7, 0.7, -0.35, 0.35)).toBe(true);
  });

  it('finds every shelf of a bookcase with the free height above it', () => {
    const boards = [0.1, 0.5, 0.9, 1.3, 1.7].map((y) => box(0, y, 0, 0.8, 0.04, 0.3));
    const sides = [box(-0.42, 0.9, 0, 0.04, 1.8, 0.32), box(0.42, 0.9, 0, 0.04, 1.8, 0.32)];
    const surfaces = scanSurfaces([...boards, ...sides].flatMap((b) => boxTriangles(b)));
    const heights = surfaces.map((s) => Math.round(s.y * 100) / 100);
    expect(heights).toEqual([1.72, 1.32, 0.92, 0.52, 0.12]);
    expect(surfaces[0].clearance).toBe(Infinity);
    surfaces.slice(1).forEach((s) => {
      expect(s.clearance).toBeCloseTo(0.36, 2);
      expect(covers(s, -0.4, 0.4, -0.15, 0.15)).toBe(true);
    });
  });

  it('keeps the area under an overhang separate for tall items', () => {
    // Тумба с телевизором: под экраном над столешницей всего 6 см.
    const stand = [box(0, 0.2, 0, 1.4, 0.4, 0.42), box(0, 0.78, 0, 1.1, 0.64, 0.05)].flatMap((b) => boxTriangles(b));
    const top = scanSurfaces(stand).filter((s) => near(s.y, 0.4, 0.005));
    const open = top.filter((s) => s.clearance === Infinity);
    expect(open.length).toBeGreaterThanOrEqual(2);
    open.forEach((s) => expect(s.maxZ <= -0.025 + 0.02 || s.minZ >= 0.025 - 0.02 || s.maxX <= -0.55 + 0.02 || s.minX >= 0.55 - 0.02).toBe(true));
    expect(top.some((s) => s.clearance < 0.1 && covers(s, -0.7, 0.7, -0.21, 0.21))).toBe(true);
  });

  it('treats the topmost face as a surface even with inverted normals', () => {
    const surfaces = scanSurfaces(boxTriangles(box(0, 0.25, 0, 0.6, 0.5, 0.4), true));
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].y).toBeCloseTo(0.5, 3);
    expect(covers(surfaces[0], -0.3, 0.3, -0.2, 0.2)).toBe(true);
  });

  it('returns nothing for empty, degenerate or too small geometry', () => {
    expect(scanSurfaces([])).toEqual([]);
    expect(scanSurfaces([0, 0, 0, 1, 0, 0, 2, 0, 0])).toEqual([]);
    expect(scanSurfaces(boxTriangles(box(0, 0.5, 0, 0.04, 1, 0.04)))).toEqual([]);
  });
});
