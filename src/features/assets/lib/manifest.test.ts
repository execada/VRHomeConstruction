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

  it('rejects HDRIs that are not .hdr files', () => {
    const m = parseManifest({ ...valid, hdris: [{ ...valid.hdris[0], file: '/assets/hdri/a.png' }] });
    expect(m.hdris).toHaveLength(0);
  });
});
