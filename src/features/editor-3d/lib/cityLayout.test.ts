import { describe, expect, it } from 'vitest';
import { cityLayout } from './cityLayout';

describe('cityLayout', () => {
  const options = { radius: 600, clear: 70, elevation: 90 };
  const city = cityLayout(options);

  it('is deterministic for a seed and changes with it', () => {
    expect(cityLayout(options)).toEqual(city);
    expect(cityLayout({ ...options, seed: 5 })).not.toEqual(city);
  });

  it('fills the ring between the plaza around the tower and the radius', () => {
    expect(city.length).toBeGreaterThan(200);
    for (const b of city) {
      const reach = Math.hypot(b.width, b.depth) / 2;
      expect(Math.hypot(b.x, b.z) - reach).toBeGreaterThan(options.clear - 1);
      expect(Math.hypot(b.x, b.z) + reach).toBeLessThan(options.radius + 1);
    }
  });

  it('keeps every roof below the apartment so the real skyline stays above the horizon', () => {
    expect(city.every((b) => b.height >= 9 && b.height <= options.elevation * 0.72)).toBe(true);
    expect(Math.max(...city.map((b) => b.height))).toBeGreaterThan(options.elevation * 0.5);
  });

  it('mixes stone and glass buildings', () => {
    const glass = city.filter((b) => b.glass).length / city.length;
    expect(glass).toBeGreaterThan(0.1);
    expect(glass).toBeLessThan(0.4);
  });

  it('leaves streets between blocks', () => {
    expect(city.every((b) => b.width < 32 && b.depth < 32 && b.width > 10 && b.depth > 10)).toBe(true);
  });
});
