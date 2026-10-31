import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@/shared/lib/color/colorTemperature';
import { formatHour, MAX_ELEVATION, normalizeHour, skyTint, sunState } from './sun';

describe('sunState', () => {
  it('rises in the east (+X) at sunrise', () => {
    const s = sunState(6, 'front');
    expect(s.direction[0]).toBeCloseTo(1);
    expect(s.elevation).toBeCloseTo(0);
  });

  it('is highest above the chosen side at noon', () => {
    const front = sunState(13, 'front');
    expect(front.elevation).toBeCloseTo(MAX_ELEVATION);
    expect(front.direction[2]).toBeGreaterThan(0.4);
    const back = sunState(13, 'back');
    expect(back.direction[2]).toBeLessThan(-0.4);
  });

  it('sets in the west (-X)', () => {
    expect(sunState(20, 'back').direction[0]).toBeCloseTo(-1);
  });

  it('returns a unit direction vector', () => {
    const [x, y, z] = sunState(9.5, 'front').direction;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });

  it('turns daylight off at night and on during the day', () => {
    expect(sunState(23, 'front').daylight).toBe(0);
    expect(sunState(2, 'front').elevation).toBeLessThan(0);
    expect(sunState(12, 'front').daylight).toBe(1);
  });

  it('is warmer near the horizon than at noon', () => {
    const evening = hexToRgb(sunState(19.5, 'front').color);
    const noon = hexToRgb(sunState(13, 'front').color);
    expect(evening[2]).toBeLessThan(noon[2]);
    expect(sunState(13, 'front').kelvin).toBeGreaterThan(sunState(19.5, 'front').kelvin);
  });
});

describe('time helpers', () => {
  it('normalizes hours', () => {
    expect(normalizeHour(25)).toBe(1);
    expect(normalizeHour(-1)).toBe(23);
  });

  it('formats hours as HH:MM', () => {
    expect(formatHour(9.5)).toBe('09:30');
    expect(formatHour(23.999)).toBe('00:00');
    expect(formatHour(0)).toBe('00:00');
  });

  it('dims the sky color at night', () => {
    expect(skyTint('#88aaff', 0).intensity).toBeCloseTo(0.15);
    expect(skyTint('#88aaff', 1).intensity).toBeCloseTo(1);
  });
});
