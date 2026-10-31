import { describe, expect, it } from 'vitest';
import { hexToRgb, isHexColor, kelvinToHex, mixHex, multiplyHex } from './colorTemperature';

describe('kelvinToHex', () => {
  it('returns warm orange for candle light', () => {
    const [r, g, b] = hexToRgb(kelvinToHex(1900));
    expect(r).toBe(255);
    expect(g).toBeLessThan(150);
    expect(b).toBeLessThan(60);
  });

  it('is close to white around 6600K', () => {
    const [r, g, b] = hexToRgb(kelvinToHex(6600));
    expect(r).toBeGreaterThan(245);
    expect(g).toBeGreaterThan(240);
    expect(b).toBeGreaterThan(240);
  });

  it('is bluish for overcast sky', () => {
    const [r, , b] = hexToRgb(kelvinToHex(12000));
    expect(b).toBe(255);
    expect(r).toBeLessThan(220);
  });

  it('clamps out-of-range temperatures', () => {
    expect(kelvinToHex(10)).toBe(kelvinToHex(1000));
    expect(kelvinToHex(1e9)).toBe(kelvinToHex(40000));
  });
});

describe('hex helpers', () => {
  it('validates hex colors', () => {
    expect(isHexColor('#a1B2c3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });

  it('falls back to white for invalid input', () => {
    expect(hexToRgb('nope')).toEqual([255, 255, 255]);
  });

  it('mixes colors linearly and clamps t', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  it('multiplies colors for tinting', () => {
    expect(multiplyHex('#ffffff', '#336699')).toBe('#336699');
    expect(multiplyHex('#808080', '#ffffff')).toBe('#808080');
  });
});
