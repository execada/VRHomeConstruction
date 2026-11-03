import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SIZE_RANGES,
  GENERIC_SIZE_RANGE,
  fitsRange,
  formatSizeIssue,
  isIdentityNormalization,
  orientSize,
  resolveNormalization,
  validateSize,
} from './normalization';

const sofaMeters = { x: 2.1, y: 0.8, z: 0.95 };

describe('orientSize', () => {
  it('keeps Y-up sizes and swaps width/depth on quarter turns', () => {
    expect(orientSize({ x: 1, y: 2, z: 3 }, 'y', 0)).toEqual({ x: 1, y: 2, z: 3 });
    expect(orientSize({ x: 1, y: 2, z: 3 }, 'y', 90)).toEqual({ x: 3, y: 2, z: 1 });
    expect(orientSize({ x: 1, y: 2, z: 3 }, 'y', 180)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('treats Z as height for Z-up models', () => {
    expect(orientSize({ x: 1, y: 2, z: 3 }, 'z', 0)).toEqual({ x: 1, y: 3, z: 2 });
    expect(orientSize({ x: 1, y: 2, z: 3 }, 'z', 270)).toEqual({ x: 2, y: 3, z: 1 });
  });
});

describe('fitsRange', () => {
  it('checks height and the larger horizontal side', () => {
    expect(fitsRange(sofaMeters, CATEGORY_SIZE_RANGES.seating)).toBe(true);
    expect(fitsRange({ x: 210, y: 80, z: 95 }, CATEGORY_SIZE_RANGES.seating)).toBe(false);
    expect(fitsRange({ x: 0.5, y: 3, z: 0.5 }, CATEGORY_SIZE_RANGES.seating)).toBe(false);
  });
});

describe('resolveNormalization', () => {
  it('leaves correctly scaled models untouched', () => {
    const n = resolveNormalization(sofaMeters, { category: 'seating' });
    expect(n).toMatchObject({ unit: 'm', upAxis: 'y', scale: 1, rotationX: 0, rotationY: 0, corrected: false });
    expect(n.size).toEqual(sofaMeters);
    expect(isIdentityNormalization(n)).toBe(true);
  });

  it('detects centimetres and millimetres by the bounding box', () => {
    const cm = resolveNormalization({ x: 210, y: 80, z: 95 }, { category: 'seating' });
    expect(cm.unit).toBe('cm');
    expect(cm.scale).toBeCloseTo(0.01);
    expect(cm.size.y).toBeCloseTo(0.8);
    expect(cm.corrected).toBe(true);

    const mm = resolveNormalization({ x: 600, y: 1800, z: 650 }, { category: 'kitchen' });
    expect(mm.unit).toBe('mm');
    expect(mm.size.y).toBeCloseTo(1.8);
  });

  it('detects ×10 (decimetre) exports before ambiguous inches', () => {
    // Реальный случай: steel_frame_shelves_01 с Poly Haven в 10 раз больше реального.
    const n = resolveNormalization({ x: 10.974, y: 21.405, z: 5.021 }, { category: 'storage' });
    expect(n.unit).toBe('dm');
    expect(n.size.y).toBeCloseTo(2.1405);
  });

  it('uses a generic plausibility range for models without a category', () => {
    expect(resolveNormalization({ x: 2.2, y: 1.2, z: 2.2 }).unit).toBe('m');
    expect(resolveNormalization({ x: 45, y: 100, z: 50 }).unit).toBe('cm');
    expect(resolveNormalization({ x: 450, y: 1000, z: 500 }).size.y).toBeCloseTo(1);
  });

  it('stands up Z-up models when only that orientation is plausible', () => {
    // Торшер «лёжа»: высота 1.8 оказалась по оси Z
    const n = resolveNormalization({ x: 0.4, y: 0.4, z: 1.8 }, { category: 'lighting' });
    expect(n.upAxis).toBe('y');
    const lying = resolveNormalization({ x: 0.45, y: 0.5, z: 2.0 }, { category: 'bathroom', rule: {} });
    expect(lying.upAxis).toBe('y');
    const fridge = resolveNormalization({ x: 0.9, y: 0.05, z: 1.8 }, { category: 'kitchen' });
    expect(fridge.upAxis).toBe('z');
    expect(fridge.rotationX).toBeCloseTo(-Math.PI / 2);
    expect(fridge.size).toEqual({ x: 0.9, y: 1.8, z: 0.05 });
  });

  it('honours forced units and axes from the manifest', () => {
    const n = resolveNormalization({ x: 72, y: 34, z: 38 }, { category: 'seating', rule: { unit: 'in' } });
    expect(n.unit).toBe('in');
    expect(n.size.x).toBeCloseTo(1.8288);
    expect(n.corrected).toBe(false);

    const z = resolveNormalization({ x: 1, y: 2, z: 0.5 }, { category: 'decor', rule: { upAxis: 'z' } });
    expect(z.upAxis).toBe('z');
    expect(z.size.y).toBe(0.5);
  });

  it('scales uniformly to a target height, width or depth', () => {
    const h = resolveNormalization({ x: 2.41, y: 0.96, z: 1.14 }, { category: 'tables', rule: { targetHeight: 0.76 } });
    expect(h.size.y).toBeCloseTo(0.76);
    expect(h.size.x).toBeCloseTo(2.41 * (0.76 / 0.96));
    expect(h.scale).toBeCloseTo(0.76 / 0.96);

    const w = resolveNormalization({ x: 2, y: 1, z: 1 }, { rule: { targetWidth: 1 } });
    expect(w.size).toEqual({ x: 1, y: 0.5, z: 0.5 });
    const d = resolveNormalization({ x: 2, y: 1, z: 4 }, { rule: { targetDepth: 2 } });
    expect(d.scale).toBeCloseTo(0.5);
  });

  it('turns the front to +Z on request, swapping width and depth', () => {
    const n = resolveNormalization({ x: 0.37, y: 1.56, z: 1.08 }, { category: 'storage', rule: { rotationY: 90 } });
    expect(n.rotationY).toBeCloseTo(Math.PI / 2);
    expect(n.size).toEqual({ x: 1.08, y: 1.56, z: 0.37 });
    expect(isIdentityNormalization(n)).toBe(false);
  });

  it('applies target sizes after unit conversion', () => {
    const n = resolveNormalization({ x: 200, y: 100, z: 90 }, { category: 'tables', rule: { unit: 'cm', targetHeight: 0.75 } });
    expect(n.size.y).toBeCloseTo(0.75);
    expect(n.scale).toBeCloseTo(0.0075);
  });

  it('survives degenerate bounding boxes', () => {
    const n = resolveNormalization({ x: 0, y: Number.NaN, z: -1 }, { category: 'decor', rule: { targetHeight: 1 } });
    expect(n.scale).toBe(1);
    expect(Number.isFinite(n.size.y)).toBe(true);
  });

  it('falls back to identity when no unit makes the size plausible', () => {
    const n = resolveNormalization({ x: 5000, y: 0.001, z: 3 }, { category: 'seating' });
    expect(n).toMatchObject({ unit: 'm', upAxis: 'y', scale: 1 });
  });
});

describe('validateSize', () => {
  it('accepts plausible sizes and reports out-of-range dimensions', () => {
    expect(validateSize(sofaMeters, 'seating')).toEqual([]);
    const issues = validateSize({ x: 0.3, y: 2.9, z: 0.3 }, 'tables');
    expect(issues).toEqual([{ dimension: 'height', value: 2.9, range: CATEGORY_SIZE_RANGES.tables.height }]);
    expect(formatSizeIssue(issues[0])).toBe('высота 2.90 м вне диапазона 0.25–1.20 м');
  });

  it('checks the footprint and uses the generic range without a category', () => {
    const issues = validateSize({ x: 12, y: 1, z: 1 });
    expect(issues).toEqual([{ dimension: 'footprint', value: 12, range: GENERIC_SIZE_RANGE.footprint }]);
    expect(formatSizeIssue(issues[0])).toContain('габарит в плане 12.00 м');
  });

  it('has a range for every category, wide enough for real furniture', () => {
    Object.values(CATEGORY_SIZE_RANGES).forEach(({ height, footprint }) => {
      expect(height[0]).toBeLessThan(height[1]);
      expect(footprint[0]).toBeLessThan(footprint[1]);
    });
  });
});
