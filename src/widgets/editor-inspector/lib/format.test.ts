import { describe, expect, it } from 'vitest';
import { cm, toDegrees, toRadians } from './format';

describe('inspector format', () => {
  it('метры в сантиметры', () => {
    expect(cm(1.234)).toBe('123 см');
    expect(cm(0)).toBe('0 см');
  });

  it('радианы в градусы в диапазоне −180..180', () => {
    expect(toDegrees(Math.PI / 2)).toBe(90);
    expect(toDegrees(-Math.PI / 2)).toBe(-90);
    expect(toDegrees(3 * Math.PI)).toBe(-180);
    expect(toDegrees(2 * Math.PI + 0.1)).toBe(6);
  });

  it('градусы в радианы', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI);
    expect(toDegrees(toRadians(45))).toBe(45);
  });
});
