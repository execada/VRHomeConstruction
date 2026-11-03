import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { obbCorners, obbOverlap, pointInObb } from '@/shared/lib/math/geometry2d';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { actions as furnitureActions, reducer as furnitureReducer } from '@/features/furniture/slice';
import { KNOWN_MODEL_SIZES, MODELS } from '@/features/furniture/lib/knownSizes';
import { furnitureSurfacesCache } from '@/features/furniture/surfacesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { SelectionFeature } from '@/features/selection';
import { sceneLoadActions } from '../../sceneActions';
import { createEmptyScene } from '../../lib/scene/build';
import { furnitureFootprint, itemSizes } from '../../lib/placement';
import type { Ray3 } from '../../lib/surfaces';
import { interaction, interactionStore } from '../interactionStore';
import { createSceneCommands } from './index';

const SHELF_LEVELS = [1.72, 1.32, 0.92, 0.52, 0.12].map((y, i) => ({
  y,
  minX: -0.4,
  maxX: 0.4,
  minZ: -0.15,
  maxZ: 0.15,
  clearance: i === 0 ? Infinity : 0.36,
}));

function setup(furniture: FurnitureItem[] = []) {
  const actions: string[] = [];
  const store = configureStore({
    reducer: { editor: editorReducer, furniture: furnitureReducer, ...SelectionFeature.reducer },
    middleware: (gdm) =>
      gdm({ thunk: false }).concat(() => (next) => (action) => {
        actions.push((action as { type: string }).type);
        return next(action);
      }),
  });
  sceneLoadActions({ ...createEmptyScene({ width: 4, height: 2.7, depth: 4 }), furniture }).forEach((a) => store.dispatch(a));
  const notify = vi.fn();
  const commands = createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify });
  const get = (id: string) => store.getState().furniture.items.find((i) => i.id === id)!;
  return { store, commands, notify, get, actions };
}

/** Предмет с известными габаритами модели (как после размещения из каталога). */
const at = (id: string, path: string, name: string, x: number, z: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name,
  modelPath: path,
  position: [x, 0, z],
  rotation: [0, 0, 0],
  scale: 1,
  ...KNOWN_MODEL_SIZES[path],
  ...extra,
});

const desk = (x = 0, z = 0) => at('desk', 'primitive:desk', 'Письменный стол', x, z);
const shelf = (x = 0, z = 0) => at('shelf', 'primitive:shelf', 'Стеллаж', x, z);
const down = (x: number, z: number): Ray3 => ({ origin: [x, 3, z], direction: [0, -1, 0] });

/** Футпринт предмета целиком над опорой. */
const onTop = (item: FurnitureItem, support: FurnitureItem) =>
  obbCorners(furnitureFootprint(item)).every((c) => pointInObb(c, { ...furnitureFootprint(support), half: furnitureFootprint(support).half.map((h) => h + 1e-6) as [number, number] }));

describe('placing items on surfaces', () => {
  beforeEach(() => {
    furnitureSurfacesCache.set('primitive:shelf', SHELF_LEVELS);
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('puts a desk lamp on the desk the pointer looks at', () => {
    const { commands, get } = setup([desk()]);
    const id = commands.furniture.place(MODELS.deskLamp, 'Настольная лампа', [0.2, 0], null, { ray: down(0.2, 0) })!;
    const lamp = get(id);
    expect(lamp.supportId).toBe('desk');
    expect(lamp.position[1]).toBeCloseTo(0.75);
    expect(onTop(lamp, get('desk'))).toBe(true);
  });

  it('shows the placement ghost on the surface and on the floor next to it', () => {
    const { commands } = setup([desk()]);
    const onDesk = commands.furniture.previewPlacement(MODELS.vase, [0, 0], null, { name: 'Ваза', aim: { ray: down(0.3, 0.1) } });
    expect(onDesk).toMatchObject({ supportId: 'desk', valid: true });
    expect(onDesk.elevation).toBeCloseTo(0.75);
    expect(onDesk.center[0]).toBeCloseTo(0.3);
    const onFloor = commands.furniture.previewPlacement(MODELS.vase, [1.5, 1.5], null, { name: 'Ваза', aim: { ray: down(1.5, 1.5) } });
    expect(onFloor).toMatchObject({ supportId: null, elevation: 0, valid: true });
  });

  it('keeps the item inside the edge of the surface', () => {
    const { commands, get } = setup([desk()]);
    const id = commands.furniture.place(MODELS.vase, 'Ваза', [0, 0], 0, { ray: down(0.69, 0.34) })!;
    expect(onTop(get(id), get('desk'))).toBe(true);
  });

  it('uses the shelf the pointer looks at and refuses items taller than the gap', () => {
    const { commands, get } = setup([shelf()]);
    const fromFront: Ray3 = { origin: [0, 0.75, 2], direction: [0, -0.23, -2] };
    const id = commands.furniture.place(MODELS.vase, 'Ваза', [0, 0], 0, { ray: fromFront })!;
    expect(get(id).position[1]).toBeCloseTo(0.52);
    const tooTall = commands.furniture.previewPlacement(MODELS.deskLamp, [0, 0], 0, { name: 'Настольная лампа', aim: { ray: fromFront } });
    expect(tooTall.valid).toBe(false);
  });

  it('places a second item next to the first one on the same surface, and reports a full surface', () => {
    const nightstand = at('ns', MODELS.sideTable, 'Прикроватная тумба', 0, 0);
    const { commands, get, notify } = setup([nightstand]);
    // Тумба 55 × 45 см: две вазы по 22 см помещаются рядом, только если первая стоит сбоку.
    const a = commands.furniture.place(MODELS.vase, 'Ваза', [-0.2, 0], 0, { supportId: 'ns', elevation: 0.551 })!;
    const b = commands.furniture.place(MODELS.vase, 'Ваза', [-0.2, 0], 0, { supportId: 'ns', elevation: 0.551 })!;
    expect(get(b).supportId).toBe('ns');
    expect(obbOverlap(furnitureFootprint(get(a)), furnitureFootprint(get(b))).overlapping).toBe(false);
    expect(commands.furniture.place(MODELS.deskLamp, 'Настольная лампа', [0, 0], 0, { supportId: 'ns', elevation: 0.551 })).toBeNull();
    expect(notify).toHaveBeenCalledWith('На этой поверхности нет свободного места');
  });

  it('keeps floor furniture on the floor', () => {
    const { commands, get } = setup([desk()]);
    const id = commands.furniture.place('primitive:stool', 'Табурет', [1.5, 1.5], 0, { ray: down(0.2, 0) })!;
    expect(get(id).supportId).toBeUndefined();
    expect(get(id).position[1]).toBe(0);
  });
});

describe('moving items between surfaces and the floor', () => {
  const lamp = (x: number, y: number, z: number, supportId?: string) =>
    at('lamp', MODELS.deskLamp, 'Настольная лампа', x, z, { position: [x, y, z], supportId });

  it('slides along the desk on the plan and drops to the floor beyond its edge', () => {
    const { commands, get } = setup([desk(), lamp(0.2, 0.75, 0, 'desk')]);
    expect(commands.furniture.move('lamp', [0.5, 0.1])).toBe(true);
    expect(get('lamp')).toMatchObject({ supportId: 'desk', position: [0.5, 0.75, expect.any(Number)] });
    expect(commands.furniture.move('lamp', [1.4, 1])).toBe(true);
    expect(get('lamp').supportId).toBeUndefined();
    expect(get('lamp').position[1]).toBe(0);
  });

  it('lifts an item from the floor onto a support under it', () => {
    const { commands, get } = setup([desk(), lamp(1.5, 0, 1.5)]);
    commands.furniture.move('lamp', [-0.3, 0]);
    expect(get('lamp').supportId).toBe('desk');
    expect(get('lamp').position[1]).toBeCloseTo(0.75);
  });

  it('follows the pointer ray with the grab offset in 3D and VR', () => {
    const { commands, get } = setup([desk(), lamp(1.5, 0, 1.5)]);
    commands.furniture.move('lamp', [9, 9], { ray: down(-0.3, 0), offset: [0.05, 0] });
    expect(get('lamp').supportId).toBe('desk');
    expect(get('lamp').position[0]).toBeCloseTo(-0.25);
  });

  it('rotates an item on its surface and refuses turns that do not fit', () => {
    const narrow = at('narrow', 'primitive:shelf', 'Стеллаж', 0, 0);
    const vase = at('vase', MODELS.pictureFrame, 'Фоторамка', 0, 0, { position: [0, 1.72, 0], supportId: 'narrow' });
    const { commands, get } = setup([narrow, vase]);
    expect(commands.furniture.rotate('vase', Math.PI / 2)).toBe(true);
    expect(get('vase')).toMatchObject({ supportId: 'narrow', rotation: [0, Math.PI / 2, 0] });
    expect(get('vase').position[1]).toBeCloseTo(1.72);
    expect(commands.furniture.setScale('vase', 4)).toBe(false);
  });
});

describe('supports carry the items on them', () => {
  const lampOn = (x: number, z: number) =>
    at('lamp', MODELS.deskLamp, 'Настольная лампа', x, z, { position: [x, 0.75, z], supportId: 'desk' });

  it('moves and turns the items together with the support in one action', () => {
    const { commands, get, actions } = setup([desk(), lampOn(0.4, 0.1)]);
    actions.length = 0;
    expect(commands.furniture.move('desk', [0.5, 0])).toBe(true);
    expect(get('lamp').position[0]).toBeCloseTo(0.9);
    expect(actions).toEqual([furnitureActions.updateFurnitureItems.type]);
    expect(commands.furniture.rotate('desk', Math.PI / 2)).toBe(true);
    expect(get('lamp').position[0]).toBeCloseTo(0.6);
    expect(get('lamp').position[2]).toBeCloseTo(-0.4);
    expect(get('lamp').rotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('does not move a support if an item on it would hit other furniture', () => {
    const wallShelf = at('wall', 'primitive:shelf', 'Полка', 1.2, 0, { position: [1.2, 1.2, 0], height: 0.3, halfWidth: 0.3, halfDepth: 0.2 });
    const { commands, get } = setup([desk(), lampOn(0.4, 0), wallShelf]);
    expect(commands.furniture.move('desk', [0.6, 0])).toBe(false);
    expect(get('desk').position[0]).toBe(0);
  });

  it('is not blocked by its own items on lower shelves', () => {
    const book = at('book', MODELS.vase, 'Ваза', 0, 0, { position: [0, 0.52, 0], supportId: 'shelf' });
    const { commands, get } = setup([shelf(), book]);
    expect(commands.furniture.move('shelf', [0.8, 0.5])).toBe(true);
    expect(get('book').position).toEqual([0.8, 0.52, 0.5]);
  });

  it('drops the items to the floor when the support is deleted', () => {
    const vase = at('vase', MODELS.vase, 'Ваза', -0.4, 0, { position: [-0.4, 0.75, 0], supportId: 'desk' });
    const { commands, get, notify, store } = setup([desk(), lampOn(0.4, 0), vase]);
    commands.select({ kind: 'furniture', id: 'desk' });
    commands.deleteSelection();
    expect(store.getState().furniture.items).toHaveLength(2);
    ['lamp', 'vase'].forEach((id) => {
      expect(get(id).supportId).toBeUndefined();
      expect(get(id).position[1]).toBe(0);
    });
    expect(obbOverlap(furnitureFootprint(get('lamp')), furnitureFootprint(get('vase'))).overlapping).toBe(false);
    expect(notify).toHaveBeenCalledWith('Предметы с поверхности перенесены на пол: 2');
  });

  it('takes a single item down to the floor next to its support', () => {
    const { commands, get } = setup([desk(), lampOn(0.4, 0)]);
    commands.furniture.dropToFloor('lamp');
    expect(get('lamp').supportId).toBeUndefined();
    expect(get('lamp').position[1]).toBe(0);
    expect(obbOverlap(furnitureFootprint(get('lamp')), furnitureFootprint(get('desk'))).overlapping).toBe(false);
  });

  it('duplicates an item on the same surface', () => {
    const { commands, get } = setup([desk(), lampOn(0.4, 0)]);
    const copy = commands.furniture.duplicate('lamp')!;
    expect(get(copy).supportId).toBe('desk');
    expect(obbOverlap(furnitureFootprint(get(copy)), furnitureFootprint(get('lamp'))).overlapping).toBe(false);
  });

  it('lifts the items when the support grows and drops what no longer fits when it shrinks', () => {
    const { commands, get } = setup([desk(), lampOn(0.4, 0)]);
    expect(commands.furniture.setScale('desk', 1.2)).toBe(true);
    expect(get('lamp').position[1]).toBeCloseTo(0.9);
    expect(get('lamp').position[0]).toBeCloseTo(0.48);

    const book = at('book', MODELS.vase, 'Ваза', 0, 0, { position: [0, 0.52, 0], supportId: 'shelf' });
    const second = setup([shelf(), book]);
    expect(second.commands.furniture.setScale('shelf', 0.6)).toBe(true);
    expect(second.get('book').supportId).toBeUndefined();
    expect(second.notify).toHaveBeenCalledWith('Не поместились на поверхности и сняты на пол: 1');
  });

  it('raises the items with the support and detaches an item given its own height', () => {
    const { commands, get, store } = setup([desk(), lampOn(0.4, 0)]);
    commands.furniture.setElevation('desk', 0.2);
    expect(get('lamp').position[1]).toBeCloseTo(0.95);
    commands.furniture.setElevation('desk', 5);
    const top = get('lamp').position[1] + itemSizes(get('lamp')).height;
    expect(top).toBeLessThanOrEqual(store.getState().editor.dimensions.height + 1e-6);
    commands.furniture.setElevation('lamp', 1.5);
    expect(get('lamp').supportId).toBeUndefined();
    expect(get('lamp').position[1]).toBeCloseTo(1.5);
  });

  it('keeps items on the support when a partition pushes it or the room is resized', () => {
    const { commands, get } = setup([desk(), lampOn(0.4, 0)]);
    commands.partitions.add([0, 0], Math.PI / 2);
    const pushed = get('desk');
    expect(pushed.position[0]).not.toBe(0);
    expect(get('lamp').position[0] - pushed.position[0]).toBeCloseTo(0.4);
    expect(get('lamp').position[1]).toBeCloseTo(0.75);

    const before = get('lamp').position[0] - get('desk').position[0];
    commands.room.dragWall('left', 1);
    expect(get('lamp').position[0] - get('desk').position[0]).toBeCloseTo(before);
    expect(get('lamp').supportId).toBe('desk');
  });
});
