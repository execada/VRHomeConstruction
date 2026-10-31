import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { obbOverlap } from '@/shared/lib/math/geometry2d';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import { SelectionFeature } from '@/features/selection';
import { sceneLoadActions } from '../../sceneActions';
import { createEmptyScene } from '../../lib/scene/build';
import { furnitureFootprint, partitionFootprint } from '../../lib/placement';
import { openingSill, openingsOverlap } from '../../lib/openings';
import { interaction, interactionStore } from '../interactionStore';
import { createSceneCommands } from './index';

function setup() {
  const store = configureStore({
    reducer: { editor: editorReducer, furniture: furnitureReducer, ...SelectionFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }),
  });
  sceneLoadActions(createEmptyScene({ width: 4, height: 2.7, depth: 4 })).forEach((a) => store.dispatch(a));
  const notify = vi.fn();
  const commands = createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify });
  return { store, commands, notify };
}

describe('furniture commands', () => {
  beforeEach(() => {
    furnitureSizesCache.set('primitive:sofa', { halfWidth: 0.9, halfDepth: 0.43, height: 0.85 });
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('places a model on the floor, against the nearest wall, and selects it', () => {
    const { store, commands } = setup();
    const id = commands.furniture.place('primitive:sofa', 'Диван', [0, -1.8], null)!;
    const item = store.getState().furniture.items[0];
    expect(item.id).toBe(id);
    expect(item.position[1]).toBe(0);
    expect(item.rotation).toEqual([0, 0, 0]);
    expect(item.position[2] - 0.43).toBeCloseTo(-2);
    expect(store.getState().selection.current).toEqual({ kind: 'furniture', id });
  });

  it('puts a second model next to the first one instead of inside it', () => {
    const { store, commands } = setup();
    commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0);
    commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0);
    const [a, b] = store.getState().furniture.items;
    expect(obbOverlap(furnitureFootprint(a), furnitureFootprint(b)).overlapping).toBe(false);
  });

  it('refuses moves into occupied space but allows free moves', () => {
    const { store, commands } = setup();
    const a = commands.furniture.place('primitive:sofa', 'Диван', [0, -1], 0)!;
    expect(commands.furniture.move(a, [0.5, 1])).toBe(true);
    expect(store.getState().furniture.items[0].position[0]).toBeCloseTo(0.5);
  });

  it('does not move locked items', () => {
    const { store, commands } = setup();
    const a = commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0)!;
    commands.furniture.toggleLock(a);
    expect(commands.furniture.move(a, [1, 1])).toBe(false);
    expect(store.getState().furniture.items[0].locked).toBe(true);
  });

  it('duplicates into free space and selects the copy', () => {
    const { store, commands } = setup();
    const a = commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0)!;
    const copy = commands.furniture.duplicate(a)!;
    const [first, second] = store.getState().furniture.items;
    expect(obbOverlap(furnitureFootprint(first), furnitureFootprint(second)).overlapping).toBe(false);
    expect(store.getState().selection.current).toEqual({ kind: 'furniture', id: copy });
  });

  it('notifies when a scaled item cannot fit', () => {
    const { commands, notify } = setup();
    const a = commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0)!;
    expect(commands.furniture.setScale(a, 5)).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it('limits elevation so the item stays under the ceiling', () => {
    const { store, commands } = setup();
    const a = commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0)!;
    commands.furniture.setElevation(a, 10);
    expect(store.getState().furniture.items[0].position[1]).toBeCloseTo(2.7 - 0.85);
  });

  it('pushes furniture out of a newly added partition', () => {
    const { store, commands } = setup();
    commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0);
    commands.partitions.add([0, 0], Math.PI / 2);
    const item = store.getState().furniture.items[0];
    const wall = store.getState().editor.partitions[0];
    expect(obbOverlap(furnitureFootprint(item), partitionFootprint(wall)).overlapping).toBe(false);
  });
});

describe('opening commands', () => {
  it('adds openings without overlaps and selects them', () => {
    const { store, commands } = setup();
    const first = commands.openings.add('back', 'window')!;
    const second = commands.openings.add('back', 'window')!;
    expect(openingsOverlap(first, second)).toBe(false);
    expect(store.getState().editor.openings.back).toHaveLength(2);
    expect(store.getState().selection.current).toEqual({ kind: 'opening', hostId: 'back', id: second.id });
  });

  it('changes sill height, size and type', () => {
    const { store, commands } = setup();
    const w = commands.openings.add('left', 'window')!;
    commands.openings.setSill('left', w.id, 0.6);
    commands.openings.resize('left', w.id, { width: 1.6 });
    let current = store.getState().editor.openings.left[0];
    expect(openingSill(current)).toBeCloseTo(0.6);
    expect(current.width).toBeCloseTo(1.6);
    commands.openings.setType('left', w.id, 'door');
    current = store.getState().editor.openings.left[0];
    expect(current.type).toBe('door');
    expect(openingSill(current)).toBeCloseTo(0);
  });

  it('works on partitions and removes openings', () => {
    const { store, commands } = setup();
    const pid = commands.partitions.add([0, 0]);
    const door = commands.openings.add(pid, 'door')!;
    expect(store.getState().editor.partitions[0].openings).toHaveLength(1);
    commands.openings.move(pid, door.id, { u: 0.3, y: 5 });
    expect(openingSill(store.getState().editor.partitions[0].openings[0])).toBeCloseTo(0);
    commands.openings.remove(pid, door.id);
    expect(store.getState().editor.partitions[0].openings).toHaveLength(0);
  });

  it('refuses openings on removed walls', () => {
    const { commands } = setup();
    commands.room.toggleWall('front');
    expect(commands.openings.add('front', 'door')).toBeNull();
  });
});

describe('room and selection commands', () => {
  it('drags a wall and keeps furniture relative to the opposite wall', () => {
    const { store, commands } = setup();
    commands.furniture.place('primitive:sofa', 'Диван', [-1, 0], 0);
    const before = store.getState().furniture.items[0].position[0] - -2;
    commands.room.dragWall('right', 1);
    expect(store.getState().editor.dimensions.width).toBeCloseTo(5);
    expect(store.getState().furniture.items[0].position[0] - -2.5).toBeCloseTo(before);
  });

  it('clamps room dimensions and wall thickness', () => {
    const { store, commands } = setup();
    commands.room.resize({ width: 100, height: 0.5, depth: 4 });
    expect(store.getState().editor.dimensions).toEqual({ width: 50, height: 1.5, depth: 4 });
    commands.room.setWallThickness(5);
    expect(store.getState().editor.wallThickness).toBeCloseTo(0.6);
  });

  it('deletes and rotates the current selection', () => {
    const { store, commands } = setup();
    const id = commands.furniture.place('primitive:sofa', 'Диван', [0, 0], 0)!;
    commands.rotateSelection(Math.PI / 2);
    expect(store.getState().furniture.items[0].rotation[1]).toBeCloseTo(Math.PI / 2);
    commands.select({ kind: 'furniture', id });
    commands.deleteSelection();
    expect(store.getState().furniture.items).toHaveLength(0);
    expect(store.getState().selection.current).toBeNull();
  });
});
