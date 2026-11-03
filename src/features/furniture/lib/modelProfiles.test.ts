import { describe, expect, it } from 'vitest';
import manifestJson from '../../../../public/assets/manifest.json';
import { parseManifest } from '@/features/assets/lib/manifest';
import { formatSizeIssue, resolveNormalization, validateSize } from './normalization';
import { MODEL_PROFILES, modelProfile, profileSizes } from './modelProfiles';

const models = parseManifest(manifestJson).models;

describe('model profiles from the bundled manifest', () => {
  it('describes every manifest model by its file path', () => {
    expect(MODEL_PROFILES.size).toBe(models.length);
    const sofa = models.find((m) => m.id === 'Sofa_01')!;
    expect(modelProfile(sofa.file)).toMatchObject({ category: 'seating', dimensions: sofa.dimensions });
    expect(modelProfile('/models/unknown.glb')).toBeUndefined();
  });

  it('derives half sizes for placement from real-world dimensions', () => {
    const sizes = profileSizes([
      { file: '/assets/models/a/a.gltf', category: 'tables', dimensions: { width: 1.2, height: 0.75, depth: 0.8 } },
      { file: '/assets/models/b/b.gltf', category: 'decor' },
    ]);
    expect(sizes).toEqual({ '/assets/models/a/a.gltf': { halfWidth: 0.6, halfDepth: 0.4, height: 0.75 } });
  });
});

describe('manifest models', () => {
  it('have real-world dimensions within their category range', () => {
    models.forEach((m) => {
      expect(m.dimensions, m.id).toBeDefined();
      const size = { x: m.dimensions!.width, y: m.dimensions!.height, z: m.dimensions!.depth };
      expect(validateSize(size, m.category).map(formatSizeIssue), m.id).toEqual([]);
    });
  });

  it('declare units and axes explicitly instead of relying on auto-correction', () => {
    models.forEach((m) => {
      // Записанные габариты уже нормализованы: повторная нормализация ничего не меняет.
      const size = { x: m.dimensions!.width, y: m.dimensions!.height, z: m.dimensions!.depth };
      const n = resolveNormalization(size, { category: m.category });
      expect(n.corrected, m.id).toBe(false);
    });
  });

  it('stay within the VR budget', () => {
    models.forEach((m) => {
      expect(m.triangles ?? 0, m.id).toBeLessThanOrEqual(180_000);
      expect(m.sizeBytes, m.id).toBeLessThanOrEqual(8 * 1024 * 1024);
    });
  });
});
