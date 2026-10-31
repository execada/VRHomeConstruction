import { describe, expect, it } from 'vitest';
import { viewModeSchema } from '../controls/viewMode';
import { ICON_PATHS } from './paths';

describe('иконки', () => {
  it('у каждой иконки есть контуры SVG без повторов (они же ключи React)', () => {
    for (const [name, paths] of Object.entries(ICON_PATHS)) {
      expect(paths.length, name).toBeGreaterThan(0);
      expect(new Set(paths).size, name).toBe(paths.length);
      for (const d of paths) expect(d, name).toMatch(/^[Mm]/);
    }
  });

  it('есть иконки, нужные оболочке и доске проектов', () => {
    for (const name of ['home', 'cube', 'gear', 'upload', 'bell', 'star', 'pencil', 'more', 'folder', 'grid', 'list', 'search']) {
      expect(ICON_PATHS).toHaveProperty(name);
    }
  });
});

describe('viewModeSchema', () => {
  it('принимает только плитку и список', () => {
    expect(viewModeSchema.parse('grid')).toBe('grid');
    expect(viewModeSchema.safeParse('table').success).toBe(false);
  });
});
