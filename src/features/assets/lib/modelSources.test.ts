import { describe, expect, it } from 'vitest';
import {
  buildModelEntry,
  parseModelsConfig,
  pickPolyhavenFiles,
  polyhavenAuthors,
  renderAttributions,
  renderLicenseRows,
  replaceBetweenMarkers,
  roundedDimensions,
  type ModelSource,
} from './modelSources';

const polyhaven: ModelSource = { source: 'polyhaven', id: 'Sofa_01', label: 'Диван', category: 'seating' };
const local: ModelSource = {
  source: 'local',
  id: 'glam_velvet_sofa',
  label: 'Диван бархатный',
  category: 'seating',
  file: 'glam_velvet_sofa.gltf',
  normalize: { rotationY: 180 },
  credit: {
    author: 'Eric Chadwick (Wayfair)',
    license: 'CC-BY 4.0',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa',
    attribution: '"Glam Velvet Sofa" (c) 2021 Wayfair LLC',
    changes: 'textures downscaled to 1K',
  },
};

describe('parseModelsConfig', () => {
  it('accepts Poly Haven and local sources', () => {
    expect(parseModelsConfig({ models: [polyhaven, local] })).toEqual([polyhaven, local]);
  });

  it('rejects duplicates, unsafe file names and CC-BY without attribution', () => {
    expect(() => parseModelsConfig({ models: [polyhaven, polyhaven] })).toThrow('Sofa_01');
    expect(() => parseModelsConfig({ models: [{ ...local, file: '../evil.gltf' }] })).toThrow();
    const { attribution: _drop, ...credit } = local.source === 'local' ? local.credit : ({} as never);
    expect(() => parseModelsConfig({ models: [{ ...local, credit }] })).toThrow('атрибуц');
    expect(() => parseModelsConfig({ nope: true })).toThrow();
  });
});

describe('pickPolyhavenFiles', () => {
  const files = {
    gltf: {
      '1k': {
        gltf: {
          url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/x/x_1k.gltf',
          md5: 'a'.repeat(32),
          size: 10,
          include: {
            'x.bin': { url: 'https://dl.polyhaven.org/x.bin', md5: 'b'.repeat(32), size: 20 },
            'textures/x_diff_1k.jpg': { url: 'https://dl.polyhaven.org/d.jpg', md5: 'c'.repeat(32), size: 30 },
          },
        },
      },
    },
  };

  it('lists the 1k glTF and its includes with checksums', () => {
    const picked = pickPolyhavenFiles(files);
    expect(picked.map((f) => f.path)).toEqual(['x_1k.gltf', 'x.bin', 'textures/x_diff_1k.jpg']);
    expect(picked[0]).toMatchObject({ md5: 'a'.repeat(32), main: true });
    expect(picked[2].main).toBe(false);
  });

  it('refuses unexpected hosts and path traversal', () => {
    const evilHost = structuredClone(files);
    evilHost.gltf['1k'].gltf.url = 'https://evil.example/x.gltf';
    expect(() => pickPolyhavenFiles(evilHost)).toThrow();
    const traversal = structuredClone(files) as { gltf: { '1k': { gltf: { include: Record<string, unknown> } } } };
    traversal.gltf['1k'].gltf.include['../../secret.jpg'] = { url: 'https://dl.polyhaven.org/s.jpg', md5: 'd'.repeat(32), size: 1 };
    expect(() => pickPolyhavenFiles(traversal)).toThrow();
    expect(() => pickPolyhavenFiles({})).toThrow('1k');
  });
});

describe('polyhavenAuthors', () => {
  it('joins author names', () => {
    expect(polyhavenAuthors({ authors: { 'Rob Tuytel': 'All', 'Rico Cilliers': 'Textures' } })).toBe('Rob Tuytel, Rico Cilliers');
    expect(polyhavenAuthors({})).toBe('Poly Haven');
  });
});

describe('buildModelEntry', () => {
  it('produces a manifest entry with real-world dimensions', () => {
    const entry = buildModelEntry(local, {
      author: 'ignored for local',
      file: '/assets/models/glam_velvet_sofa/glam_velvet_sofa.gltf',
      thumbnail: '/assets/models/glam_velvet_sofa/thumb.jpg',
      sizeBytes: 1234,
      triangles: 4196,
      size: { x: 2.18842, y: 0.78749, z: 1.0228 },
    });
    expect(entry).toEqual({
      id: 'glam_velvet_sofa',
      label: 'Диван бархатный',
      category: 'seating',
      file: '/assets/models/glam_velvet_sofa/glam_velvet_sofa.gltf',
      thumbnail: '/assets/models/glam_velvet_sofa/thumb.jpg',
      sizeBytes: 1234,
      dimensions: { width: 2.188, height: 0.787, depth: 1.023 },
      triangles: 4196,
      normalize: { rotationY: 180 },
      source: local.source === 'local' ? local.credit.url : '',
      license: 'CC-BY 4.0',
      author: 'Eric Chadwick (Wayfair)',
    });
  });

  it('credits Poly Haven models with their page and CC0', () => {
    const entry = buildModelEntry(polyhaven, {
      author: 'Kirill Sannikov',
      file: '/assets/models/Sofa_01/Sofa_01_1k.gltf',
      thumbnail: '/assets/models/Sofa_01/thumb.jpg',
      sizeBytes: 1,
      triangles: 2,
      size: { x: 1, y: 1, z: 1 },
    });
    expect(entry).toMatchObject({ source: 'https://polyhaven.com/a/Sofa_01', license: 'CC0', author: 'Kirill Sannikov' });
    expect(entry).not.toHaveProperty('normalize');
  });

  it('never rounds a dimension down to zero', () => {
    expect(roundedDimensions({ x: 0.0001, y: 1.23456, z: 2 })).toEqual({ width: 0.001, height: 1.235, depth: 2 });
  });
});

describe('license rendering', () => {
  const entry = { id: 'Sofa_01', author: 'Kirill Sannikov', source: 'https://polyhaven.com/a/Sofa_01', license: 'CC0' };

  it('renders table rows', () => {
    expect(renderLicenseRows([entry])).toBe('| Sofa_01 | 3D model (glTF) | Kirill Sannikov | https://polyhaven.com/a/Sofa_01 | CC0 1.0 |');
    expect(renderLicenseRows([{ ...entry, license: 'CC-BY 4.0' }])).toContain('| CC BY 4.0 |');
  });

  it('renders full attributions for CC-BY sources only', () => {
    const text = renderAttributions([polyhaven, local]);
    expect(text).toContain('"Glam Velvet Sofa" (c) 2021 Wayfair LLC');
    expect(text).toContain('Changes: textures downscaled to 1K');
    expect(text).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(renderAttributions([polyhaven])).toBe('No CC BY models.');
  });

  it('replaces the generated block between markers', () => {
    const doc = 'head\n<!-- a -->\nold\n<!-- b -->\ntail';
    expect(replaceBetweenMarkers(doc, '<!-- a -->', '<!-- b -->', 'new')).toBe('head\n<!-- a -->\nnew\n<!-- b -->\ntail');
    expect(() => replaceBetweenMarkers('no markers', '<!-- a -->', '<!-- b -->', 'x')).toThrow('<!-- a -->');
  });
});
