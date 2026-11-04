import { describe, expect, it } from 'vitest';
import { openingSill } from '@/features/editor-3d/lib/openings';
import { doorOn, panoramicWindowOn } from './compose';

describe('template helpers', () => {
  it('creates doors with an installed door or as an empty doorway', () => {
    expect(doorOn('d', 'back', 0).door).toMatchObject({ style: 'panel', open: false });
    expect(doorOn('d', 'back', 0, 0.9, 2.1, { open: true, style: 'glass' }).door).toMatchObject({ open: true, style: 'glass' });
    expect(doorOn('d', 'back', 0, 0.9, 2.1, null).door).toBeUndefined();
  });

  it('creates floor-to-ceiling panoramic windows or windows on a low parapet', () => {
    const full = panoramicWindowOn('p', 'front', 0, 4.5, 2.8);
    expect(openingSill(full)).toBeCloseTo(0);
    expect(full.height).toBeCloseTo(2.8);
    const parapet = panoramicWindowOn('p', 'front', 0, 4.5, 2.8, 0.4);
    expect(openingSill(parapet)).toBeCloseTo(0.4);
    expect(parapet.height).toBeCloseTo(2.4);
  });
});
