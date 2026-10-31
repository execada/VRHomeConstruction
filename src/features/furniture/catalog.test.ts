import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '@/features/assets/lib/manifest';
import { ALL_CATEGORIES, buildCatalog, catalogCategories, catalogName, filterCatalog } from './catalog';

const sofa: ModelEntry = {
  id: 'Sofa_01',
  label: 'Диван',
  category: 'seating',
  file: '/assets/models/Sofa_01/Sofa_01_1k.gltf',
  thumbnail: '/assets/models/Sofa_01/thumb.jpg',
  sizeBytes: 517935,
  source: 'https://polyhaven.com/a/Sofa_01',
  license: 'CC0',
  author: 'K',
};

describe('furniture catalog', () => {
  const catalog = buildCatalog([sofa]);

  it('lists quality assets first, then primitives and user models', () => {
    expect(catalog[0]).toMatchObject({ path: sofa.file, category: 'Сидения', source: 'asset' });
    expect(catalog.some((c) => c.source === 'primitive')).toBe(true);
    expect(catalog.some((c) => c.source === 'user')).toBe(true);
  });

  it('builds categories starting with "Все"', () => {
    const categories = catalogCategories(catalog);
    expect(categories[0]).toBe(ALL_CATEGORIES);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('filters by query and category', () => {
    expect(filterCatalog(catalog, 'диван', ALL_CATEGORIES).every((c) => c.name.toLowerCase().includes('диван'))).toBe(true);
    expect(filterCatalog(catalog, '', 'Кухня').every((c) => c.category === 'Кухня')).toBe(true);
  });

  it('resolves names by path with a readable fallback', () => {
    expect(catalogName(catalog, sofa.file)).toBe('Диван');
    expect(catalogName(catalog, '/models/some_new-chair.glb')).toBe('Some new chair');
  });
});
