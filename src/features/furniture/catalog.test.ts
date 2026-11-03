import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '@/features/assets/lib/manifest';
import { modelCategorySchema } from '@/features/assets/lib/manifest';
import { ALL_CATEGORIES, buildCatalog, catalogCategories, catalogName, filterCatalog, formatDimensions, guessCategory } from './catalog';

const sofa: ModelEntry = {
  id: 'Sofa_01',
  label: 'Диван',
  category: 'seating',
  file: '/assets/models/Sofa_01/Sofa_01_1k.gltf',
  thumbnail: '/assets/models/Sofa_01/thumb.jpg',
  sizeBytes: 517935,
  dimensions: { width: 1.571, height: 0.797, depth: 0.658 },
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

  it('gives every item a stable category id', () => {
    const ids = new Set(modelCategorySchema.options);
    catalog.forEach((item) => expect(ids.has(item.categoryId), item.path).toBe(true));
    expect(catalog[0]).toMatchObject({ categoryId: 'seating', dimensions: sofa.dimensions });
    expect(catalog.find((c) => c.path === 'primitive:fridge')?.categoryId).toBe('kitchen');
    expect(catalog.find((c) => c.path === 'primitive:rug')?.dimensions).toEqual({ width: 2, height: 0.022, depth: 1.4 });
  });
});

describe('guessCategory', () => {
  it.each([
    ['/models/bed.glb', 'bedroom'],
    ['/models/chair.glb', 'seating'],
    ['/models/classic_table.glb', 'tables'],
    ['/models/commode.glb', 'storage'],
    ['/models/wood-crate/untitled.gltf', 'storage'],
    ['/models/Floor_Lamp.glb', 'lighting'],
    ['/models/toilet.glb', 'bathroom'],
    ['/models/fridge.glb', 'kitchen'],
    ['/models/tv.glb', 'appliances'],
    ['/models/monstera-plant.glb', 'plants'],
    ['/models/retro_vintage_furniture_pack.glb', 'decor'],
  ])('%s → %s', (path, category) => {
    expect(guessCategory(path)).toBe(category);
  });
});

describe('formatDimensions', () => {
  it('shows width × depth × height in centimetres', () => {
    expect(formatDimensions({ width: 1.571, height: 0.797, depth: 0.658 })).toBe('157 × 66 × 80 см');
  });
});

