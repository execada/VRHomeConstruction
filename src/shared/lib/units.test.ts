import { describe, expect, it } from 'vitest';
import { formatArea, formatMeters } from './units';

describe('units', () => {
  it('formats areas and lengths with a decimal comma', () => {
    expect(formatArea(12.345)).toBe('12,3 м²');
    expect(formatArea(7, 2)).toBe('7,00 м²');
    expect(formatMeters(3.456)).toBe('3,46 м');
  });
});
