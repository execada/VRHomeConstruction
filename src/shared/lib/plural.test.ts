import { describe, expect, it } from 'vitest';
import { pluralize } from './plural';

const FORMS = ['проект', 'проекта', 'проектов'] as const;

describe('pluralize', () => {
  it.each([
    [0, '0 проектов'],
    [1, '1 проект'],
    [2, '2 проекта'],
    [4, '4 проекта'],
    [5, '5 проектов'],
    [11, '11 проектов'],
    [12, '12 проектов'],
    [14, '14 проектов'],
    [21, '21 проект'],
    [22, '22 проекта'],
    [101, '101 проект'],
    [111, '111 проектов'],
  ])('%i → %s', (count, expected) => {
    expect(pluralize(count, FORMS)).toBe(expected);
  });
});
