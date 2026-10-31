import { describe, expect, it } from 'vitest';
import { applyPreset, computeDpr, DEFAULT_GRAPHICS, detectPreset, GRAPHICS_PRESETS, withOverride } from './presets';

describe('graphics presets', () => {
  it('applies preset values but keeps the FPS counter', () => {
    const settings = applyPreset({ ...DEFAULT_GRAPHICS, showFps: true }, 'low');
    expect(settings).toMatchObject({ preset: 'low', shadows: false, shadowMapSize: 512, showFps: true });
  });

  it('detects matching presets and custom combinations', () => {
    expect(detectPreset(GRAPHICS_PRESETS.high)).toBe('high');
    expect(detectPreset({ ...GRAPHICS_PRESETS.high, shadowMapSize: 4096 })).toBe('custom');
  });

  it('switches to custom on manual overrides and back when values match again', () => {
    const custom = withOverride(DEFAULT_GRAPHICS, { antialias: false });
    expect(custom.preset).toBe('custom');
    expect(withOverride(custom, { antialias: true }).preset).toBe('medium');
  });

  it('does not treat the FPS counter as a preset parameter', () => {
    expect(withOverride(DEFAULT_GRAPHICS, { showFps: true }).preset).toBe('medium');
  });
});

describe('computeDpr', () => {
  it('scales and clamps the device pixel ratio', () => {
    expect(computeDpr(2, 0.75)).toBeCloseTo(1.5);
    expect(computeDpr(3, 1.5)).toBe(2);
    expect(computeDpr(1, 0.25)).toBe(0.5);
  });

  it('falls back to 1 for invalid ratios', () => {
    expect(computeDpr(Number.NaN, 1)).toBe(1);
    expect(computeDpr(0, 1)).toBe(1);
  });
});
