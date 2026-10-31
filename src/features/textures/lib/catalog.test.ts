import { describe, expect, it } from 'vitest';
import type { TextureEntry } from '@/features/assets/lib/manifest';
import { buildTextureCatalog, resolveTexture, textureFromEntry, texturesFor } from './catalog';

const entry: TextureEntry = {
  id: 'oak',
  label: 'Дуб',
  category: 'floor',
  tileMeters: 1.7,
  maps: { color: '/assets/textures/oak/color.jpg', roughness: '/assets/textures/oak/roughness.jpg' },
  thumbnail: '/assets/textures/oak/thumb.jpg',
  source: 'https://polyhaven.com/a/oak',
  license: 'CC0',
  author: 'A',
};

describe('texture catalog', () => {
  it('maps manifest entries to texture definitions', () => {
    const def = textureFromEntry(entry);
    expect(def.maps?.roughness).toBe('/assets/textures/oak/roughness.jpg');
    expect(def.credit?.license).toBe('CC0');
  });

  it('puts PBR textures before procedural ones', () => {
    const catalog = buildTextureCatalog([entry]);
    expect(catalog[0].id).toBe('oak');
    expect(catalog.some((t) => t.id === 'floor-wood')).toBe(true);
  });

  it('filters by surface', () => {
    const catalog = buildTextureCatalog([entry]);
    expect(texturesFor(catalog, 'ceiling').every((t) => t.category === 'ceiling')).toBe(true);
  });

  it('resolves known ids and falls back for missing floor textures', () => {
    const catalog = buildTextureCatalog([]);
    expect(resolveTexture(catalog, null, 'floor')).toBeNull();
    expect(resolveTexture(catalog, 'wall-brick', 'wall')?.id).toBe('wall-brick');
    expect(resolveTexture(catalog, 'missing', 'floor')?.id).toBe('floor-wood');
    expect(resolveTexture(catalog, 'missing', 'wall')).toBeNull();
  });
});
