import { describe, expect, it } from 'vitest';
import { clampResidence } from '@/features/environment/slice';
import { DEFAULT_ELEVATION, residenceSite, STOREY_HEIGHT, storeyElevation } from './site';

const city = { kind: 'elevated' as const, elevation: 120 };

describe('квартира в доме', () => {
  it('без неё — как задано пейзажем', () => {
    expect(residenceSite(city, { enabled: false, storey: 3, storeys: 9 }, 3)).toMatchObject({ kind: 'elevated', elevation: 120, tower: true, above: 0 });
    expect(residenceSite(undefined, { enabled: false, storey: 3, storeys: 9 }, 3)).toMatchObject({ kind: 'ground', elevation: 0, tower: false });
    expect(residenceSite({ kind: 'elevated' }, { enabled: false, storey: 1, storeys: 1 }, 3).elevation).toBe(DEFAULT_ELEVATION);
  });

  it('пол квартиры — на высоте своего этажа, этажи выше — над ней', () => {
    expect(storeyElevation(1)).toBe(0);
    expect(storeyElevation(10)).toBe(9 * STOREY_HEIGHT);
    const inCity = residenceSite(city, { enabled: true, storey: 10, storeys: 25 }, 3.3);
    expect(inCity).toMatchObject({ kind: 'elevated', elevation: 27, tower: true });
    expect(inCity.above).toBeCloseTo(25 * 3 - 27 - 3.3);
    const country = residenceSite(undefined, { enabled: true, storey: 2, storeys: 2 }, 3);
    expect(country).toMatchObject({ kind: 'ground', elevation: 3, tower: true, above: 0 });
  });

  it('этаж и этажность приводятся к целым в пределах, дом не ниже этажа квартиры', () => {
    expect(clampResidence({ enabled: true, storey: 12.4, storeys: 9 })).toEqual({ enabled: true, storey: 12, storeys: 12 });
    expect(clampResidence({ enabled: true, storey: 0, storeys: 100 })).toEqual({ enabled: true, storey: 1, storeys: 60 });
    expect(clampResidence({ enabled: false, storey: Number.NaN, storeys: Number.NaN })).toEqual({ enabled: false, storey: 5, storeys: 9 });
  });
});
