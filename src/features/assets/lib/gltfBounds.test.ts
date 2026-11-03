import { describe, expect, it } from 'vitest';
import { gltfBounds, gltfResourceUris, parseGltfJson, type GltfJson } from './gltfBounds';

const cube = (min: number[], max: number[], count = 36) => ({ count, min, max });

const sample: GltfJson = {
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { translation: [1, 0, 0], scale: [2, 2, 2], children: [1, 2] },
    { mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
    { mesh: 0, translation: [0, 1, 0] },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [cube([-0.5, 0, -0.25], [0.5, 1, 0.25], 24), cube([0], [23], 36)],
};

describe('gltfBounds', () => {
  it('combines node transforms, mesh instances and accessor bounds', () => {
    const b = gltfBounds(sample);
    // Первый экземпляр повёрнут на 90° вокруг Y: 1 × 0.5 → 0.5 × 1; затем масштаб 2 и сдвиг на 1 по X.
    expect(b.min[0]).toBeCloseTo(0);
    expect(b.max[0]).toBeCloseTo(2);
    expect(b.min[1]).toBeCloseTo(0);
    expect(b.max[1]).toBeCloseTo(4);
    expect(b.size.z).toBeCloseTo(2);
    expect(b.triangles).toBe(24);
  });

  it('honours explicit matrices and the default scene', () => {
    const json: GltfJson = {
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, matrix: [100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 1] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [cube([0, 0, 0], [0.01, 0.02, 0.005], 6)],
    };
    const b = gltfBounds(json);
    expect(b.size.x).toBeCloseTo(1);
    expect(b.size.y).toBeCloseTo(2);
    expect(b.triangles).toBe(2);
  });

  it('counts strips and skips non-triangle primitives', () => {
    const json: GltfJson = {
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, mode: 5 },
            { attributes: { POSITION: 0 }, mode: 1 },
          ],
        },
      ],
      accessors: [cube([0, 0, 0], [1, 1, 1], 10)],
    };
    expect(gltfBounds(json).triangles).toBe(8);
  });

  it('returns an empty box for scenes without meshes', () => {
    const b = gltfBounds({ scenes: [{ nodes: [0] }], nodes: [{}] });
    expect(b.size).toEqual({ x: 0, y: 0, z: 0 });
    expect(b.triangles).toBe(0);
  });
});

describe('parseGltfJson', () => {
  it('reads plain glTF JSON', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } }));
    expect(parseGltfJson(bytes)).toEqual({ asset: { version: '2.0' } });
  });

  it('reads the JSON chunk of a GLB container', () => {
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, nodes: [] }).padEnd(48, ' '));
    const glb = new Uint8Array(20 + json.length);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.length, true);
    view.setUint32(12, json.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.set(json, 20);
    expect(parseGltfJson(glb)).toEqual({ asset: { version: '2.0' }, nodes: [] });
  });

  it('rejects broken containers', () => {
    const glb = new Uint8Array(24);
    new DataView(glb.buffer).setUint32(0, 0x46546c67, true);
    new DataView(glb.buffer).setUint32(12, 999, true);
    expect(() => parseGltfJson(glb)).toThrow('GLB');
  });
});

describe('gltfResourceUris', () => {
  it('lists external buffers and images once, skipping embedded data', () => {
    const json: GltfJson = {
      buffers: [{ uri: 'model.bin', byteLength: 10 }, { byteLength: 5 }],
      images: [{ uri: 'textures/a.jpg' }, { uri: 'textures/a.jpg' }, { uri: 'data:image/png;base64,AA==' }, { bufferView: 0 }],
    };
    expect(gltfResourceUris(json)).toEqual(['model.bin', 'textures/a.jpg']);
  });
});
