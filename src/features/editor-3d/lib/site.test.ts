import { describe, expect, it } from 'vitest';
import {
  CITY_CLEAR,
  CITY_RADIUS,
  DEFAULT_ELEVATION,
  LAWN_PHOTO_FADE,
  LAWN_PHOTO_RADIUS,
  SITE_RADIUS,
  SITE_SURFACES,
  bandColor,
  dimmedColor,
  fogRange,
  horizonColors,
  lawnTint,
  resolveSite,
  terraceBox,
} from './site';

/** Панорама 4×180 (строка — градус): небо, полоса горизонта, город под ним и земля. */
const W = 4;
const H = 180;
function panorama(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const rgb = y < 85 ? [40, 90, 200] : y < 94 ? [128, 128, 128] : y < 130 ? [90, 80, 70] : [30, 140, 40];
    for (let x = 0; x < W; x += 1) data.set([...rgb, 255], (y * W + x) * 4);
  }
  return data;
}

describe('resolveSite', () => {
  it('puts the house on a lawn by default', () => {
    expect(resolveSite()).toEqual({ kind: 'ground', surface: 'lawn', elevation: 0 });
    expect(resolveSite({ kind: 'ground' })).toEqual({ kind: 'ground', surface: 'lawn', elevation: 0 });
  });

  it('lifts city views to a rooftop terrace of a tower', () => {
    expect(resolveSite({ kind: 'elevated' })).toEqual({ kind: 'elevated', surface: 'terrace', elevation: DEFAULT_ELEVATION });
    expect(resolveSite({ kind: 'elevated', elevation: 140 }).elevation).toBe(140);
  });

  it('has PBR maps for every surface', () => {
    for (const surface of Object.values(SITE_SURFACES)) {
      expect(Object.values(surface.maps).every((path) => path.startsWith('/assets/site/'))).toBe(true);
      expect(surface.tileMeters).toBeGreaterThan(1);
    }
  });
});

describe('fog and haze', () => {
  it('keeps the apartment clear and fully hazes the ground before its edge', () => {
    for (const kind of ['ground', 'elevated'] as const) {
      const { near, far } = fogRange(kind);
      expect(near).toBeGreaterThanOrEqual(50);
      expect(far).toBeGreaterThan(near);
      expect(far).toBeLessThan(SITE_RADIUS);
    }
  });

  it('hands the lawn over to the photo before the lawn ends', () => {
    expect(LAWN_PHOTO_FADE[0]).toBeLessThan(LAWN_PHOTO_FADE[1]);
    expect(LAWN_PHOTO_FADE[1]).toBeLessThan(LAWN_PHOTO_RADIUS);
  });

  it('builds the city inside the ground, around a plaza at the tower', () => {
    expect(CITY_CLEAR).toBeGreaterThan(20);
    expect(CITY_RADIUS).toBeLessThan(SITE_RADIUS);
  });
});

describe('terraceBox', () => {
  it('covers the walkable lot exactly', () => {
    expect(terraceBox({ minX: -13.5, maxX: 13.5, minZ: -11, maxZ: 11 })).toEqual({ width: 27, depth: 22, center: [0, 0] });
  });
});

describe('panorama colors', () => {
  it('averages a band below the horizon', () => {
    expect(bandColor(panorama(), W, H, 45, 85)).toEqual([30, 140, 40]);
    expect(bandColor(panorama(), W, H, -80, -30)).toEqual([40, 90, 200]);
  });

  it('takes the haze from around eye level and the grass from the ground below it', () => {
    const colors = horizonColors(panorama(), W, H);
    expect(colors.horizon).toEqual([128, 128, 128]);
    expect(colors.ground).toEqual([90, 80, 70]);
  });

  it('falls back to a neutral color for broken input', () => {
    expect(bandColor(new Uint8ClampedArray(4), W, H, 0, 10)).toEqual([150, 160, 170]);
    expect(bandColor(panorama(), 0, 0, 0, 10)).toEqual([150, 160, 170]);
  });

  it('turns the grass on the photo into a lawn albedo', () => {
    const tint = lawnTint([90, 140, 60]);
    const photo = dimmedColor([90, 140, 60], 1);
    expect(tint.g).toBeLessThan(photo.g);
    expect(tint.g / tint.r).toBeCloseTo(photo.g / photo.r, 5);
  });

  it('dims the haze like the background (in linear space)', () => {
    expect(dimmedColor([255, 128, 0], 1).getHexString()).toBe('ff8000');
    expect(dimmedColor([255, 255, 255], 0).getHexString()).toBe('000000');
    const half = dimmedColor([255, 255, 255], 0.5);
    expect(half.r).toBeCloseTo(0.5, 5);
  });
});
