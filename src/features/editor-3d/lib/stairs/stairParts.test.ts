import { describe, expect, it } from 'vitest';
import { stairParts, STRINGER } from './stairParts';
import { BALUSTRADE_HEIGHT, HANDRAIL_HEIGHT, stairLayout } from './stairs';

describe('детали лестницы', () => {
  const layout = stairLayout('straight', 3.3);
  const parts = stairParts(layout, 1);

  it('проступь и подступёнок на каждую ступень; проступи между тетивами', () => {
    expect(parts.treads).toHaveLength(layout.risers - 1);
    expect(parts.risers).toHaveLength(layout.risers - 1);
    parts.treads.forEach((t) => expect(t.size[0]).toBeCloseTo(1 - 2 * STRINGER));
  });

  it('верх каждой проступи — на высоте своей ступени, марш поднимается к −z', () => {
    parts.treads.forEach((t, i) => expect(t.center[1] + t.size[1] / 2).toBeCloseTo((i + 1) * layout.riser));
    expect(parts.treads[0].center[2]).toBeGreaterThan(parts.treads[parts.treads.length - 1].center[2]);
    expect(parts.treads[0].center[2]).toBeLessThanOrEqual(layout.length / 2);
  });

  it('поручни идут над носками на высоте поручня, стойки стоят на ступенях', () => {
    const flight = parts.rails.filter((r) => r.tilt !== undefined);
    expect(flight).toHaveLength(2);
    flight.forEach((r) => expect(r.tilt).toBeCloseTo(Math.atan2(layout.riser, layout.going)));
    parts.posts.forEach((p) => expect(p.center[1] - p.size[1] / 2).toBeGreaterThanOrEqual(-1e-9));
    expect(Math.max(...parts.posts.map((p) => p.center[1] + p.size[1] / 2))).toBeCloseTo(layout.rise + BALUSTRADE_HEIGHT);
    expect(flight[0].center[1]).toBeGreaterThan(HANDRAIL_HEIGHT);
  });

  it('ограждение выреза наверху — с трёх сторон, на высоте этажа выше', () => {
    expect(parts.glass).toHaveLength(3);
    parts.glass.forEach((g) => expect(g.center[1] - g.size[1] / 2).toBeCloseTo(layout.rise));
  });

  it('у площадки — толстая проступь и поручень с горизонтальным участком', () => {
    const landing = stairLayout('landing', 3.3, 1.2);
    const withLanding = stairParts(landing, 1.2);
    const thick = withLanding.treads.filter((t) => t.size[1] > 0.1);
    expect(thick).toHaveLength(1);
    expect(thick[0].size[2]).toBeCloseTo(1.2);
    expect(withLanding.rails.some((r) => r.tilt !== undefined && Math.abs(r.tilt) < 1e-9)).toBe(true);
  });
});
