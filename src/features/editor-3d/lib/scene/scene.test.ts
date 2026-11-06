import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import type { FurnitureItem } from '@/features/furniture/types';
import { openingSill } from '../openings';
import { buildSceneDocument, createEmptyScene, flattenOpenings, floorDocument, groupOpenings, toEditorPayload } from './build';
import { migrateFurniture, migrateLight, migrateV1 } from './migrate';
import { legacyPartitionMaterial, migrateV2 } from './migrateV2';
import { migrateV3 } from './migrateV3';
import { parseSceneDocument, type SceneParseResult } from './parse';
import { modelPathSchema, sceneDocumentSchema, sceneDocumentV3Schema, type FloorDocument, type SceneDocument } from './schema';

/** Первый этаж разобранного документа (тест падает, если разбор не удался). */
function firstFloor(result: SceneParseResult): FloorDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc.floors[0];
}

/** Документ v3 (одна квартира) из этажа пустой сцены. */
function v3Document(): Record<string, unknown> {
  const { id: _id, name: _name, offset: _offset, stairs: _stairs, ...storey } = createEmptyScene({ width: 5, height: 2.8, depth: 4 }).floors[0];
  return { schemaVersion: 3, ...storey, environment: DEFAULT_ENVIRONMENT };
}

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

  it('produces a document that passes the strict v3 schema', () => {
    expect(sceneDocumentV3Schema.safeParse(doc).success).toBe(true);
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

/** Документ v2 (как его сохраняла предыдущая версия приложения). */
function v2Document(): Record<string, unknown> {
  const { outerWalls: _walls, ...rest } = v3Document();
  return {
    ...rest,
    schemaVersion: 2,
    wallThickness: 0.3,
    partitions: [
      { id: 'thin', position: [0, 1.4, 0], rotation: [0, 0, 0], size: [2, 2.8, 0.1], openings: [] },
      { id: 'thick', position: [1, 1.4, 0], rotation: [0, Math.PI / 2, 0], size: [2, 2.8, 0.2], openings: [] },
    ],
  };
}

describe('migrateV2', () => {
  it('turns the shared wall thickness into per-wall construction', () => {
    const doc = migrateV2(v2Document()) as { outerWalls: Record<string, { thickness: number; material: string }>; schemaVersion: number };
    expect(doc.schemaVersion).toBe(3);
    expect(Object.values(doc.outerWalls)).toEqual(Array(4).fill({ thickness: 0.3, material: 'brick' }));
    expect('wallThickness' in doc).toBe(false);
  });

  it('assigns materials to old partitions by thickness', () => {
    const doc = migrateV2(v2Document()) as { partitions: Array<{ id: string; material: string }> };
    expect(doc.partitions.map((p) => p.material)).toEqual(['drywall', 'aerated']);
    expect(legacyPartitionMaterial(0.12)).toBe('drywall');
    expect(legacyPartitionMaterial(0.25)).toBe('aerated');
  });

  it('keeps explicit materials and tolerates broken values', () => {
    const doc = migrateV2({ ...v2Document(), wallThickness: 'thick', partitions: [{ id: 'x', material: 'brick' }, 7] });
    expect((doc.outerWalls as { front: { thickness: number } }).front.thickness).toBe(0.2);
    expect(doc.partitions).toEqual([{ id: 'x', material: 'brick' }, 7]);
    const clamped = migrateV2({ ...v2Document(), wallThickness: 5 });
    expect((clamped.outerWalls as { left: { thickness: number } }).left.thickness).toBeCloseTo(0.6);
  });

  it('is applied when parsing a v2 project and yields a valid v4 document', () => {
    const result = parseSceneDocument(v2Document());
    expect(result.ok && result.migrated).toBe(true);
    if (!result.ok) return;
    expect(sceneDocumentSchema.safeParse(result.doc).success).toBe(true);
    expect(firstFloor(result).outerWalls.right.thickness).toBeCloseTo(0.3);
    expect(firstFloor(result).partitions[1].material).toBe('aerated');
  });

  it('installs the old flat door leaf into v2 doorways (outer and interior walls)', () => {
    const doc = {
      ...v2Document(),
      openings: [{ id: 'd', wallId: 'back', type: 'door', position: [0, 1.05], width: 0.9, height: 2.1 }],
      partitions: [{ id: 'p', position: [0, 1.4, 0], rotation: [0, 0, 0], size: [2, 2.8, 0.1], openings: [{ id: 'pd', wallId: 'p', type: 'door', position: [0, 1.05], width: 0.8, height: 2.1 }] }],
    };
    const floor = firstFloor(parseSceneDocument(doc));
    expect(floor.openings[0].door).toMatchObject({ style: 'flush', open: false });
    expect(floor.partitions[0].openings[0].door).toMatchObject({ style: 'flush' });
    expect(firstFloor(parseSceneDocument(v1)).openings.find((o) => o.type === 'door')?.door).toBeTruthy();
  });

  it('salvages a v2 project with broken items after migration', () => {
    const broken = { ...v2Document(), furniture: [{ id: 'bad', modelPath: 'javascript:alert(1)' }] };
    const result = parseSceneDocument(broken);
    expect(result.ok && result.dropped).toBe(1);
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

  it('accepts valid v4 documents as is', () => {
    const doc = createEmptyScene();
    const result = parseSceneDocument(doc);
    expect(result).toEqual({ ok: true, doc, migrated: false, dropped: 0 });
  });

  it('salvages v3 documents with broken items and turns them into one floor', () => {
    const doc = v3Document();
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
    expect(result.ok && result.dropped).toBe(1);
    const floor = firstFloor(result);
    expect(floor.furniture.map((f) => f.id)).toEqual(['ok']);
    expect(floor.light).toEqual(doc.light);
    expect(floor.removedWalls).toEqual(['front']);
    expect(result.ok && sceneDocumentSchema.safeParse(result.doc).success).toBe(true);
  });

  it('salvages outer walls side by side', () => {
    const doc = createEmptyScene();
    const floor = doc.floors[0];
    const broken = { ...doc, floors: [{ ...floor, outerWalls: { ...floor.outerWalls, left: { thickness: 0.3, material: 'aerated' }, back: { thickness: -1, material: 'brick' } } }] };
    const salvaged = firstFloor(parseSceneDocument(broken));
    expect(salvaged.outerWalls.left).toEqual({ thickness: 0.3, material: 'aerated' });
    expect(salvaged.outerWalls.back).toEqual(floor.outerWalls.back);
  });

  it('migrates v1 projects straight to the current format', () => {
    const result = parseSceneDocument(v1);
    expect(result.ok && result.doc.schemaVersion).toBe(4);
    expect(firstFloor(result).partitions[0].material).toBe('drywall');
  });
});

describe('migrateV3: квартира становится первым этажом', () => {
  const furnished = (): Record<string, unknown> => ({
    ...v3Document(),
    openings: [{ id: 'w', wallId: 'front', type: 'window', position: [0, 1.5], width: 1.2, height: 1.4 }],
    partitions: [{ id: 'p', position: [0, 1.4, 0], rotation: [0, 0, 0], size: [2, 2.8, 0.1], openings: [], material: 'drywall' }],
    rooms: [{ id: 'r', name: 'Кухня', anchor: [1, 1] }],
    furniture: [{ id: 'f', name: 'Стул', modelPath: 'primitive:stool', position: [1, 0, 1], rotation: [0, 0.5, 0], scale: 1 }],
  });

  it('keeps every part of the apartment without losses', () => {
    const raw = furnished();
    const result = parseSceneDocument(raw);
    expect(result.ok && result.migrated).toBe(true);
    expect(result.ok && result.dropped).toBe(0);
    if (!result.ok) return;
    expect(result.doc.floors).toHaveLength(1);
    const floor = result.doc.floors[0];
    const { schemaVersion: _v, environment, ...storey } = raw;
    expect(floor).toMatchObject({ id: 'floor-1', name: '1 этаж', offset: [0, 0], stairs: [], ...storey });
    expect(result.doc.environment).toEqual(environment);
    expect(result.doc.slabThickness).toBeCloseTo(0.3);
  });

  it('gives a valid v4 document straight from a validated v3 one', () => {
    const v3 = sceneDocumentV3Schema.parse(furnished());
    const doc = migrateV3(v3);
    expect(sceneDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.floors[0].furniture).toEqual(v3.furniture);
  });
});

describe('документ v4: этажи и лестницы', () => {
  const twoFloors = (): SceneDocument => {
    const doc = createEmptyScene({ width: 8, height: 3, depth: 6 });
    const stair = { id: 's1', kind: 'straight' as const, position: [-3, 0] as [number, number], rotation: 0, width: 1 };
    return { ...doc, floors: [{ ...doc.floors[0], stairs: [stair] }, { ...doc.floors[0], id: 'floor-2', name: '2 этаж', offset: [0, -1] }] };
  };

  it('accepts several floors with stairs', () => {
    const result = parseSceneDocument(twoFloors());
    expect(result.ok && result.dropped).toBe(0);
    expect(result.ok && result.doc.floors.map((f) => f.id)).toEqual(['floor-1', 'floor-2']);
    expect(firstFloor(result).stairs).toHaveLength(1);
  });

  it('snaps stair rotations to quarter turns and clamps width on load', () => {
    const doc = twoFloors();
    const skewed = { ...doc, floors: [{ ...doc.floors[0], stairs: [{ ...doc.floors[0].stairs[0], rotation: 1.4, width: 2 }] }, doc.floors[1]] };
    const stair = firstFloor(parseSceneDocument(skewed)).stairs[0];
    expect(stair.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('drops only the broken parts of a floor and keeps the other floors', () => {
    const doc = twoFloors();
    const broken = {
      ...doc,
      floors: [{ ...doc.floors[0], stairs: [{ id: 'bad', kind: 'spiral' }] }, { ...doc.floors[1], furniture: [{ id: 'x' }] }],
    };
    const result = parseSceneDocument(broken);
    expect(result.ok && result.dropped).toBe(2);
    expect(result.ok && result.doc.floors.map((f) => f.name)).toEqual(['1 этаж', '2 этаж']);
    expect(result.ok && sceneDocumentSchema.safeParse(result.doc).success).toBe(true);
  });

  it('renames duplicate floor ids and fills missing names', () => {
    const doc = twoFloors();
    const raw = { ...doc, floors: [doc.floors[0], { ...doc.floors[1], id: 'floor-1', name: '' }] };
    const result = parseSceneDocument(raw);
    if (!result.ok) throw new Error(result.error);
    expect(new Set(result.doc.floors.map((f) => f.id)).size).toBe(2);
    expect(result.doc.floors[1].name).toBe('2 этаж');
  });

  it('caps the number of floors and repairs a broken slab thickness', () => {
    const doc = createEmptyScene();
    const floors = Array.from({ length: 7 }, (_, i) => ({ ...doc.floors[0], id: `f${i}` }));
    const result = parseSceneDocument({ ...doc, slabThickness: 5, floors });
    if (!result.ok) throw new Error(result.error);
    expect(result.doc.floors).toHaveLength(5);
    expect(result.doc.slabThickness).toBeCloseTo(0.3);
  });

  it('creates an empty floor when no floor survives', () => {
    const result = parseSceneDocument({ ...createEmptyScene(), floors: 'nope' });
    expect(result.ok && result.doc.floors).toHaveLength(1);
  });

  it('rejects duplicate floor ids in the strict schema', () => {
    const doc = twoFloors();
    expect(sceneDocumentSchema.safeParse({ ...doc, floors: [doc.floors[0], { ...doc.floors[1], id: 'floor-1' }] }).success).toBe(false);
  });
});

describe('support links in the document', () => {
  const desk = { id: 'desk', name: 'Письменный стол', modelPath: 'primitive:desk', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, height: 0.75 };
  const lamp = { id: 'lamp', name: 'Настольная лампа', modelPath: 'primitive:desk', position: [0.3, 0.75, 0], rotation: [0, 0, 0], scale: 1 };

  /** Пустая сцена с мебелью первого этажа. */
  const withFurniture = (furniture: unknown[], extra: Record<string, unknown> = {}) => {
    const doc = createEmptyScene();
    return { ...doc, floors: [{ ...doc.floors[0], furniture, ...extra }] };
  };

  it('keeps supportId as an optional field (old documents stay valid)', () => {
    const parsed = sceneDocumentSchema.safeParse(withFurniture([desk, { ...lamp, supportId: 'desk' }]));
    expect(parsed.success && parsed.data.floors[0].furniture[1].supportId).toBe('desk');
    expect(sceneDocumentSchema.safeParse(withFurniture([desk, lamp])).success).toBe(true);
  });

  it('keeps the cushion socket and rejects malformed socket ids', () => {
    const cushion = { ...lamp, supportId: 'desk', socket: 'back-1', rotation: [-0.26, 0, 0] };
    const parsed = sceneDocumentSchema.safeParse(withFurniture([desk, cushion]));
    expect(parsed.success && parsed.data.floors[0].furniture[1].socket).toBe('back-1');
    expect(sceneDocumentSchema.safeParse(withFurniture([desk, { ...cushion, socket: 'Back 1!' }])).success).toBe(false);
  });

  it('rejects malformed support ids', () => {
    expect(sceneDocumentSchema.safeParse(withFurniture([desk, { ...lamp, supportId: 'x'.repeat(65) }])).success).toBe(false);
  });

  it('repairs broken links and restores links of items already standing on supports when loading', () => {
    const orphan = { ...lamp, id: 'orphan', position: [1, 0.75, 1], supportId: 'gone' };
    const floor = firstFloor(parseSceneDocument(withFurniture([desk, lamp, orphan])));
    expect(floor.furniture[1].supportId).toBe('desk');
    expect(floor.furniture[2].supportId).toBeUndefined();
    expect(floor.furniture[2].position).toEqual([1, 0, 1]);
  });

  it('normalizes links in salvaged and migrated documents too', () => {
    const salvaged = firstFloor(parseSceneDocument(withFurniture([desk, lamp], { light: null })));
    expect(salvaged.furniture[1].supportId).toBe('desk');
    // В v1 y — середина модели: стол 0.75 м с центром на 0.375, лампа 0.9 м с центром на 1.2.
    const v1Desk = { ...desk, position: [0, 0.375, 0] };
    const v1Lamp = { ...lamp, height: 0.9, position: [0.3, 1.2, 0] };
    const migrated = firstFloor(parseSceneDocument({ dimensions: { width: 4, height: 3, depth: 4 }, furniture: [v1Desk, v1Lamp] }));
    expect(migrated.furniture[1].supportId).toBe('desk');
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

  it('round-trips through the editor payload and the building state', () => {
    const doc = migrateV3(migrateV1(v1));
    const [floor] = doc.floors;
    const payload = toEditorPayload(floor);
    const building = { floors: [{ id: floor.id, name: floor.name, offset: floor.offset }], activeId: floor.id, stash: {}, slabThickness: 0.3 };
    const rebuilt = buildSceneDocument(payload, floor.furniture as FurnitureItem[], DEFAULT_ENVIRONMENT, building);
    expect(rebuilt.floors[0].openings).toHaveLength(floor.openings.length);
    expect(rebuilt.floors[0].dimensions).toEqual(floor.dimensions);
    expect(sceneDocumentSchema.safeParse(rebuilt).success).toBe(true);
  });

  it('builds inactive floors from the building stash', () => {
    const doc = createEmptyScene();
    const [floor] = doc.floors;
    const upper = { ...floor, id: 'floor-2', name: '2 этаж' };
    const stash = { 'floor-2': { ...toEditorPayload(upper), furniture: [] } };
    const building = { floors: [{ id: 'floor-1', name: '1 этаж', offset: [0, 0] as [number, number] }, { id: 'floor-2', name: '2 этаж', offset: [0, 0] as [number, number] }], activeId: 'floor-1', stash, slabThickness: 0.25 };
    const rebuilt = buildSceneDocument(toEditorPayload(floor), [], DEFAULT_ENVIRONMENT, building);
    expect(rebuilt.floors.map((f) => f.id)).toEqual(['floor-1', 'floor-2']);
    expect(rebuilt.slabThickness).toBe(0.25);
    expect(floorDocument(building.floors[1], stash['floor-2'])).toEqual(rebuilt.floors[1]);
  });
});
