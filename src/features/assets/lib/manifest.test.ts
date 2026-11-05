import { describe, expect, it } from 'vitest';
import { EMPTY_MANIFEST, parseManifest } from './manifest';

const credit = { source: 'https://polyhaven.com/a/x', license: 'CC0', author: 'A' };

const valid = {
  version: 1,
  hdris: [{ id: 'meadow', label: 'Луг', file: '/assets/hdri/meadow.hdr', thumbnail: '/assets/hdri/t.jpg', ...credit }],
  textures: [
    {
      id: 'oak',
      label: 'Дуб',
      category: 'floor',
      tileMeters: 1.7,
      maps: { color: '/assets/textures/oak/color.jpg', normal: '/assets/textures/oak/normal.jpg' },
      thumbnail: '/assets/textures/oak/thumb.jpg',
      ...credit,
    },
  ],
  models: [
    {
      id: 'Sofa_01',
      label: 'Диван',
      category: 'seating',
      file: '/assets/models/Sofa_01/Sofa_01_1k.gltf',
      thumbnail: '/assets/models/Sofa_01/thumb.jpg',
      sizeBytes: 100,
      ...credit,
    },
  ],
};

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const m = parseManifest(valid);
    expect(m.hdris).toHaveLength(1);
    expect(m.textures[0].tileMeters).toBe(1.7);
    expect(m.models[0].category).toBe('seating');
  });

  it('returns an empty manifest for unknown formats', () => {
    expect(parseManifest(null)).toEqual(EMPTY_MANIFEST);
    expect(parseManifest({ version: 2 })).toEqual(EMPTY_MANIFEST);
  });

  it('skips broken entries but keeps the valid ones', () => {
    const m = parseManifest({
      ...valid,
      models: [
        ...valid.models,
        { ...valid.models[0], id: 'evil', file: 'https://evil.example/a.glb' },
        { ...valid.models[0], id: 'trav', file: '/assets/../secret.glb' },
        { ...valid.models[0], id: 'js', file: '/assets/models/x.js' },
        // Закодированный выход из каталога: браузер раскрывает %2e%2e в «..».
        { ...valid.models[0], id: 'enc', file: '/assets/%2e%2e/secret.gltf' },
        { ...valid.models[0], id: 'bs', file: '/assets/models\\..\\secret.gltf' },
        { ...valid.models[0], id: 'proto', file: '/assets//evil.example/a.gltf' },
      ],
    });
    expect(m.models.map((x) => x.id)).toEqual(['Sofa_01']);
  });

  it('accepts normalization rules, real-world dimensions and the new categories', () => {
    const model = {
      ...valid.models[0],
      id: 'toilet',
      category: 'bathroom',
      normalize: { unit: 'cm', upAxis: 'z', rotationY: 90, targetHeight: 0.8 },
      dimensions: { width: 0.38, height: 0.8, depth: 0.65 },
      triangles: 2400,
    };
    const m = parseManifest({ ...valid, models: [model, { ...model, id: 'tv', category: 'appliances', normalize: undefined }] });
    expect(m.models).toHaveLength(2);
    expect(m.models[0].normalize).toEqual({ unit: 'cm', upAxis: 'z', rotationY: 90, targetHeight: 0.8 });
    expect(m.models[0].dimensions).toEqual({ width: 0.38, height: 0.8, depth: 0.65 });
    expect(m.models[1].category).toBe('appliances');
  });

  it('drops entries with contradictory or out-of-range normalization rules', () => {
    const base = valid.models[0];
    const m = parseManifest({
      ...valid,
      models: [
        { ...base, id: 'two-targets', normalize: { targetHeight: 0.8, targetWidth: 2 } },
        { ...base, id: 'bad-turn', normalize: { rotationY: 45 } },
        { ...base, id: 'bad-unit', normalize: { unit: 'ft' } },
        { ...base, id: 'huge', normalize: { targetHeight: 50 } },
        { ...base, id: 'neg', dimensions: { width: -1, height: 1, depth: 1 } },
        { ...base, id: 'unknown-category', category: 'garage' },
      ],
    });
    expect(m.models).toEqual([]);
  });

  it('rejects HDRIs that are not .hdr files', () => {
    const m = parseManifest({ ...valid, hdris: [{ ...valid.hdris[0], file: '/assets/hdri/a.png' }] });
    expect(m.hdris).toHaveLength(0);
  });

  it('accepts a backplate photo and the site around the apartment', () => {
    const hdri = { ...valid.hdris[0], backplate: '/assets/hdri/meadow_4k.jpg', site: { kind: 'elevated', elevation: 90 } };
    const [entry] = parseManifest({ ...valid, hdris: [hdri] }).hdris;
    expect(entry.backplate).toBe('/assets/hdri/meadow_4k.jpg');
    expect(entry.site).toEqual({ kind: 'elevated', elevation: 90 });
  });

  it('rejects unsafe backplates and unknown sites', () => {
    const base = valid.hdris[0];
    for (const hdri of [
      { ...base, backplate: '/assets/hdri/meadow.exr' },
      { ...base, backplate: 'https://example.com/a.jpg' },
      { ...base, site: { kind: 'underwater' } },
      { ...base, site: { kind: 'elevated', elevation: 5000 } },
    ]) {
      expect(parseManifest({ ...valid, hdris: [hdri] }).hdris).toHaveLength(0);
    }
  });
});
