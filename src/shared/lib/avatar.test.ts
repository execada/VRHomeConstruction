import { describe, expect, it } from 'vitest';
import { avatarColor, initialsOf } from './avatar';

describe('initialsOf', () => {
  it('берёт первые буквы двух слов', () => {
    expect(initialsOf('анна петрова')).toBe('АП');
    expect(initialsOf('  Ivan  ')).toBe('I');
  });

  it('понимает почту и пустые значения', () => {
    expect(initialsOf('john.doe@mail.ru')).toBe('JD');
    expect(initialsOf('')).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});

describe('avatarColor', () => {
  it('стабилен для одного имени и даёт цвет из палитры', () => {
    expect(avatarColor('Анна')).toBe(avatarColor('Анна'));
    expect(avatarColor('Анна')).toMatch(/^#[0-9a-f]{6}$/);
    expect(avatarColor(undefined)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
