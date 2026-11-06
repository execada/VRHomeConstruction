import { describe, expect, it } from 'vitest';
import { pointInObb } from '@/shared/lib/math/geometry2d';
import type { Stair } from '../../types';
import {
  nosingLine,
  normalizeStair,
  snapQuarter,
  stairAscent,
  stairCutout,
  stairFootprint,
  stairHeightAt,
  stairLayout,
  stairLocal,
  stairObstacles,
  stairSurfaceAt,
  stairTreads,
  stringerProfile,
} from './stairs';

const stair = (patch: Partial<Stair> = {}): Stair => ({ id: 's', kind: 'straight', position: [0, 0], rotation: 0, width: 1, ...patch });

describe('раскладка ступеней', () => {
  it('подъём 3,5 м: 20 подступёнков по 17,5 см, проступь по формуле шага', () => {
    const layout = stairLayout('straight', 3.5);
    expect(layout.risers).toBe(20);
    expect(layout.riser).toBeCloseTo(0.175);
    expect(2 * layout.riser + layout.going).toBeCloseTo(0.63);
    expect(layout.length).toBeCloseTo(19 * layout.going);
    expect(layout.landing).toBeNull();
  });

  it('высота подступёнка не выходит за 20 см и при низком, и при высоком этаже', () => {
    [1.8, 2.7, 3.3, 4.2, 10.6].forEach((rise) => {
      const layout = stairLayout('straight', rise);
      expect(layout.riser, String(rise)).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(layout.riser * layout.risers).toBeCloseTo(rise);
      expect(layout.going).toBeGreaterThanOrEqual(0.25);
      expect(layout.going).toBeLessThanOrEqual(0.32);
    });
  });

  it('площадка посередине марша: длиннее прямого на глубину площадки без одной проступи', () => {
    const straight = stairLayout('straight', 3.3, 1.1);
    const landing = stairLayout('landing', 3.3, 1.1);
    expect(landing.landing).not.toBeNull();
    expect(landing.length).toBeCloseTo(straight.length - straight.going + 1.1);
    expect(landing.landing!.to - landing.landing!.from).toBeCloseTo(1.1);
    expect(stairLayout('landing', 3.3, 0.7).landing!.to - stairLayout('landing', 3.3, 0.7).landing!.from).toBeCloseTo(0.9);
  });

  it('проступи идут без зазоров от низа до верха, площадка — одна из них', () => {
    const layout = stairLayout('landing', 3.1);
    const treads = stairTreads(layout);
    expect(treads).toHaveLength(layout.risers - 1);
    treads.slice(1).forEach((t, i) => expect(t.from).toBeCloseTo(treads[i].to));
    expect(treads[0].from).toBe(0);
    expect(treads[treads.length - 1].to).toBeCloseTo(layout.length);
    expect(treads.filter((t) => t.landing)).toHaveLength(1);
    treads.forEach((t) => expect(t.top).toBeCloseTo(t.step * layout.riser));
  });
});

describe('высота поверхности марша', () => {
  const layout = stairLayout('straight', 3.5);

  it('ступенчатая: до марша пол, на каждой проступи — её высота, за верхним краем — этаж выше', () => {
    expect(stairHeightAt(layout, -0.1)).toBe(0);
    expect(stairHeightAt(layout, 0.01)).toBeCloseTo(layout.riser);
    expect(stairHeightAt(layout, layout.going * 1.5)).toBeCloseTo(2 * layout.riser);
    expect(stairHeightAt(layout, layout.length - 0.01)).toBeCloseTo(layout.rise - layout.riser);
    expect(stairHeightAt(layout, layout.length + 0.1)).toBeCloseTo(layout.rise);
  });

  it('каждый шаг вверх по маршу — не выше подступёнка', () => {
    let prev = 0;
    for (let t = -0.2; t <= layout.length + 0.2; t += 0.05) {
      const h = stairHeightAt(layout, t);
      expect(h - prev).toBeLessThanOrEqual(layout.riser + 1e-9);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });

  it('на площадке высота постоянна', () => {
    const withLanding = stairLayout('landing', 3.5);
    const { from, to, step } = withLanding.landing!;
    expect(stairHeightAt(withLanding, from + 0.05)).toBeCloseTo(step * withLanding.riser);
    expect(stairHeightAt(withLanding, to - 0.05)).toBeCloseTo(step * withLanding.riser);
  });
});

describe('лестница на плане', () => {
  const layout = stairLayout('straight', 3.2);

  it('подъём при повороте 0 идёт к −Z, при 90° — к −X', () => {
    expect(stairAscent(stair())[1]).toBeCloseTo(-1);
    expect(stairAscent(stair({ rotation: Math.PI / 2 }))[0]).toBeCloseTo(-1);
  });

  it('нижний край — с +Z, верхний — с −Z; высота над точкой следует ступеням', () => {
    const s = stair({ position: [1, 2] });
    const bottom = stairLocal(s, layout, [1, 2 + layout.length / 2]);
    expect(bottom.t).toBeCloseTo(0);
    expect(stairSurfaceAt(s, layout, [1, 2 + layout.length / 2 - 0.05])).toBeCloseTo(layout.riser);
    expect(stairSurfaceAt(s, layout, [1, 2 - layout.length / 2 + 0.05])).toBeCloseTo(layout.rise - layout.riser);
    expect(stairSurfaceAt(s, layout, [1.6, 2])).toBeNull();
    expect(stairSurfaceAt(s, layout, [1, 2 + layout.length])).toBeNull();
  });

  it('футпринт и вырез совпадают, вырез — осевой прямоугольник при любом кратном 90° повороте', () => {
    const turned = stair({ rotation: -Math.PI / 2, width: 1.2 });
    const cut = stairCutout(turned, layout);
    expect(cut.maxX - cut.minX).toBeCloseTo(layout.length);
    expect(cut.maxZ - cut.minZ).toBeCloseTo(1.2);
    expect(pointInObb([cut.minX + 0.01, cut.minZ + 0.01], stairFootprint(turned, layout))).toBe(true);
  });

  it('препятствия: бока до ограждения наверху, торец под верхним краем, ограждение выреза над нижним', () => {
    const obstacles = stairObstacles(stair(), layout);
    expect(obstacles).toHaveLength(4);
    const [left, right, end, top] = obstacles;
    expect(left.range[1]).toBeGreaterThan(layout.rise);
    expect(right.footprint.center[0]).toBeGreaterThan(0);
    expect(end.footprint.center[1]).toBeLessThan(-layout.length / 2);
    expect(end.range).toEqual([0, layout.rise]);
    expect(top.range[0]).toBeCloseTo(layout.rise);
    expect(top.footprint.center[1]).toBeGreaterThan(layout.length / 2 - 0.1);
  });

  it('тетива идёт над носками ступеней и замкнута по полу', () => {
    const profile = stringerProfile(layout, 0.3);
    expect(profile[0]).toEqual([0, 0]);
    const top = profile.slice(1, nosingLine(layout).length + 1);
    top.forEach(([, h], i) => expect(h).toBeCloseTo(nosingLine(layout)[i][1] + 0.05));
    expect(profile[profile.length - 1][1]).toBeCloseTo(0);
    const withLanding = stringerProfile(stairLayout('landing', 3.2), 0.3);
    expect(withLanding.length).toBeGreaterThan(profile.length);
    expect(stringerProfile(layout, 0.05).every(([, h]) => h >= 0)).toBe(true);
  });

  it('поворот приводится к 90°, ширина — к допустимой', () => {
    expect(snapQuarter(0.3)).toBeCloseTo(0);
    expect(snapQuarter(1.2)).toBeCloseTo(Math.PI / 2);
    expect(snapQuarter(-Math.PI)).toBeCloseTo(Math.PI);
    expect(snapQuarter(5)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeStair(stair({ width: 5, rotation: 3 }))).toMatchObject({ width: 2, rotation: Math.PI });
    expect(normalizeStair(stair({ width: Number.NaN })).width).toBe(1);
  });
});
