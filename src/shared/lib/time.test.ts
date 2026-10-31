import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './time';

const NOW = new Date(2026, 9, 28, 15, 0, 0);
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('formatRelativeTime', () => {
  it('пустая строка для отсутствующего или некорректного времени', () => {
    expect(formatRelativeTime(undefined, NOW)).toBe('');
    expect(formatRelativeTime('not a date', NOW)).toBe('');
  });

  it('недавние события', () => {
    expect(formatRelativeTime(ago(10_000), NOW)).toBe('только что');
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe('5 мин назад');
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe('3 ч назад');
  });

  it('вчера и более старые даты', () => {
    expect(formatRelativeTime(new Date(2026, 9, 27, 23, 0).toISOString(), NOW)).toBe('вчера');
    expect(formatRelativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), NOW)).toMatch(/12 окт/);
    expect(formatRelativeTime(new Date(2025, 0, 3, 10, 0).toISOString(), NOW)).toMatch(/2025/);
  });

  it('будущее время (рассинхрон часов) считается «только что»', () => {
    expect(formatRelativeTime(ago(-60_000), NOW)).toBe('только что');
  });
});
