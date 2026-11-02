import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import { openingSill } from '../openings';
import { buildSceneDocument, createEmptyScene, flattenOpenings, groupOpenings, toEditorPayload } from './build';
import { migrateFurniture, migrateLight, migrateV1 } from './migrate';
import { parseSceneDocument } from './parse';
import { modelPathSchema, sceneDocumentSchema } from './schema';

const v1 = {
  dimensions: { width: 4, height: 3, depth: 5 },
  colors: { walls: '#c0b0a0', floor: '#e8e0d0', ceiling: '#ffffff' },
  materials: { walls: 'wall-brick', floor: 'floor-wood', ceiling: 'color' },
  light: { intensity: 1.5, ambientIntensity: 0.3, color: '#ffcc99' },
  openings: [
    { id: 'w1', wallId: 'front', type: 'window', position: [0.5, 0.2], width: 1, height: 1.2 },
    { id: 'd1', wallId: 'back', type: 'door', position: [-1, -0.45], width: 0.8, height: 2.1 },
    { id: 'x', wallId: 'ghost', type: 'window', position: [0, 0], width: 1, height: 1 },
  ],
  partitions: [
    {
      id: 'p1',
      position: [0, 1.5, 0],
      rotation: [0.2, 0.5, 0],
      size: [2, 3, 0.1],
      color: '#336699',
      openings: [{ id: 'pd', wallId: 'p1', type: 'door', position: [0, -0.45], width: 0.8, height: 2.1 }],
    },
  ],
  furniture: [
    { id: 'f1', name: 'Диван', modelPath: 'primitive:sofa', position: [1, 0.4, 1], rotation: [0.3, 1, 0], scale: 1, height: 0.8 },
    { id: 'f2', name: 'Evil', modelPath: 'https://evil.example/x.glb', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  ],
};

describe('migrateV1', () => {
  const doc = migrateV1(v1);

  it('produces a document that passes the strict v2 schema', () => {
    expect(sceneDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('converts colors and materials into finishes', () => {
    expect(doc.finishes.floor).toEqual({ textureId: 'floor-wood', color: '#e8e0d0', scale: 1 });
    expect(doc.finishes.ceiling.textureId).toBeNull();
    expect(doc.finishes.walls.left.textureId).toBe('wall-brick');
  });

  it('re-bases opening heights on the floor and mirrors the front wall', () => {
    const window = doc.openings.find((o) => o.id === 'w1')!;
    expect(window.position[0]).toBeCloseTo(-0.5);
    expect(window.position[1]).toBeCloseTo(1.7);
    const door = doc.openings.find((o) => o.id === 'd1')!;
    expect(openingSill(door)).toBeCloseTo(0);
  });

  it('drops openings on unknown walls', () => {
    expect(doc.openings.some((o) => o.id === 'x')).toBe(false);
  });

  it('migrates partition colors and partition openings', () => {
    const p = doc.partitions[0];
    expect(p.finish?.color).toBe('#336699');
    expect(p.rotation).toEqual([0, 0.5, 0]);
    expect(openingSill(p.openings[0])).toBeCloseTo(0);
  });

  it('puts furniture on the floor without tilt and drops external model URLs', () => {
    expect(doc.furniture).toHaveLength(1);
    expect(doc.furniture[0].position[1]).toBe(0);
    expect(doc.furniture[0].rotation).toEqual([0, 1, 0]);
  });

  it('keeps deliberately raised items above the floor', () => {
    const [shelf] = migrateFurniture([
      { id: 's', name: 'Полка', modelPath: 'primitive:shelf', position: [0, 1.6, 0], rotation: [0, 0, 0], scale: 1, height: 0.4 },
    ]);
    expect(shelf.position[1]).toBeCloseTo(1.4);
  });

  it('uses custom light color mode for colored v1 lights', () => {
    expect(migrateLight({ color: '#ffcc99' }).colorMode).toBe('color');
    expect(migrateLight({}).colorMode).toBe('temperature');
  });

  it('clamps invalid room sizes', () => {
    const tiny = migrateV1({ dimensions: { width: 0.1, height: 100, depth: 'x' } });
    expect(tiny.dimensions).toEqual({ width: 1, height: 10, depth: 4 });
  });
});

describe('parseSceneDocument', () => {
  it('rejects non-objects', () => {
    expect(parseSceneDocument(null).ok).toBe(false);
    expect(parseSceneDocument([1, 2]).ok).toBe(false);
  });

  it('rejects documents from a newer app version', () => {
    const result = parseSceneDocument({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
  });

  it('migrates v1 documents', () => {
    const result = parseSceneDocument(v1);
    expect(result.ok && result.migrated).toBe(true);
  });

  it('accepts valid v2 documents as is', () => {
    const doc = createEmptyScene();
    const result = parseSceneDocument(doc);
    expect(result).toEqual({ ok: true, doc, migrated: false, dropped: 0 });
  });

  it('salvages v2 documents with broken items', () => {
    const doc = createEmptyScene();
    const broken = {
      ...doc,
      light: { intensity: 'bright' },
      removedWalls: ['front', 'front', 'nope'],
      furniture: [
        { id: 'ok', name: 'Стул', modelPath: 'primitive:stool', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
        { id: 'bad', name: 'Стул', modelPath: 'javascript:alert(1)', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
      ],
    };
    const result = parseSceneDocument(broken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toBe(1);
    expect(result.doc.furniture.map((f) => f.id)).toEqual(['ok']);
    expect(result.doc.light).toEqual(doc.light);
    expect(result.doc.removedWalls).toEqual(['front']);
    expect(sceneDocumentSchema.safeParse(result.doc).success).toBe(true);
  });
});

describe('support links in the document', () => {
  const desk = { id: 'desk', name: 'Письменный стол', modelPath: 'primitive:desk', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, height: 0.75 };
  const lamp = { id: 'lamp', name: 'Настольная лампа', modelPath: 'primitive:desk', position: [0.3, 0.75, 0], rotation: [0, 0, 0], scale: 1 };

  it('keeps supportId as an optional field of v2 (old documents stay valid)', () => {
    const withLink = { ...createEmptyScene(), furniture: [desk, { ...lamp, supportId: 'desk' }] };
    const parsed = sceneDocumentSchema.safeParse(withLink);
    expect(parsed.success && parsed.data.furniture[1].supportId).toBe('desk');
    expect(sceneDocumentSchema.safeParse({ ...createEmptyScene(), furniture: [desk, lamp] }).success).toBe(true);
  });

  it('rejects malformed support ids', () => {
    const bad = { ...createEmptyScene(), furniture: [desk, { ...lamp, supportId: 'x'.repeat(65) }] };
    expect(sceneDocumentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('model path validation', () => {
  it.each([
    ['primitive:sofa', true],
    ['/models/chair.glb', true],
    ['/assets/models/oak table.gltf', true],
    ['/models/../secret.glb', false],
    ['https://cdn.example.com/a.glb', false],
    ['//evil.example/a.glb', false],
    ['/models/script.js', false],
    ['/models/%2e%2e/secret.glb', false],
    ['/models\\..\\secret.glb', false],
    ['/models//evil.glb', false],
  ])('%s → %s', (path, ok) => {
    expect(modelPathSchema.safeParse(path).success).toBe(ok);
  });
});

describe('build helpers', () => {
  it('groups and flattens openings symmetrically', () => {
    const doc = migrateV1(v1);
    const grouped = groupOpenings(doc.openings);
    expect(Object.keys(grouped).sort()).toEqual(['back', 'front']);
    expect(flattenOpenings(grouped)).toHaveLength(doc.openings.length);
  });

  it('round-trips through the editor payload', () => {
    const doc = migrateV1(v1);
    const payload = toEditorPayload(doc);
    const rebuilt = buildSceneDocument(payload, doc.furniture, DEFAULT_ENVIRONMENT);
    expect(rebuilt.openings).toHaveLength(doc.openings.length);
    expect(rebuilt.dimensions).toEqual(doc.dimensions);
    expect(sceneDocumentSchema.safeParse(rebuilt).success).toBe(true);
  });
});
