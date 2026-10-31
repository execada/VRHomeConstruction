import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT } from '../constants';
import { lampCandela, lampPositions, lightColor, LAMP_DROP } from './lamps';

describe('lampPositions', () => {
  it('uses a single centered lamp for small rooms', () => {
    expect(lampPositions({ width: 3, height: 2.7, depth: 3 })).toEqual([[0, 2.7 - LAMP_DROP, 0]]);
  });

  it('spreads lamps over large rooms and respects the limit', () => {
    const lamps = lampPositions({ width: 12, height: 3, depth: 9 }, 6);
    expect(lamps.length).toBeLessThanOrEqual(6);
    expect(lamps.length).toBeGreaterThan(1);
    lamps.forEach(([x, , z]) => {
      expect(Math.abs(x)).toBeLessThan(6);
      expect(Math.abs(z)).toBeLessThan(4.5);
    });
  });
});

describe('light parameters', () => {
  it('derives color from temperature or custom color', () => {
    expect(lightColor({ ...DEFAULT_LIGHT, colorMode: 'color', color: '#123456' })).toBe('#123456');
    expect(lightColor({ ...DEFAULT_LIGHT, colorMode: 'temperature', temperature: 6600 })).not.toBe('#123456');
  });

  it('turns lamps off when the light is disabled', () => {
    expect(lampCandela({ ...DEFAULT_LIGHT, enabled: false }, 2)).toBe(0);
    expect(lampCandela(DEFAULT_LIGHT, 0)).toBe(0);
  });

  it('splits brightness sub-linearly between lamps', () => {
    const one = lampCandela(DEFAULT_LIGHT, 1);
    const four = lampCandela(DEFAULT_LIGHT, 4);
    expect(four).toBeCloseTo(one / 2);
  });
});
