import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { obbOverlap } from '@/shared/lib/math/geometry2d';
import { EnvironmentFeature } from '@/features/environment';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import { SelectionFeature } from '@/features/selection';
import { buildingSelectors } from '../../building/selectors';
import { reducer as buildingReducer } from '../../building/slice';
import { createEmptyScene } from '../../lib/scene/build';
import { furnitureFootprint } from '../../lib/placement';
import { stairFootprint, stairLayout } from '../../lib/stairs/stairs';
import { sceneLoadActions } from '../../sceneActions';
import { selectSceneDocument } from '../../sceneSelectors';
import { reducer as editorReducer } from '../../slice';
import { interaction, interactionStore } from '../interactionStore';
import { createSceneCommands } from './index';

const SOFA = 'primitive:sofa';

function setup(dims = { width: 10, height: 3, depth: 8 }) {
  const store = configureStore({
    reducer: { editor: editorReducer, building: buildingReducer, furniture: furnitureReducer, ...SelectionFeature.reducer, ...EnvironmentFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }),
  });
  sceneLoadActions(createEmptyScene(dims)).forEach((a) => store.dispatch(a));
  const notify = vi.fn();
  const commands = createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify });
  return { store, commands, notify };
}

describe('команды этажей', () => {
  beforeEach(() => {
    furnitureSizesCache.set(SOFA, { halfWidth: 0.9, halfDepth: 0.43, height: 0.85 });
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('добавляет этаж сверху с тем же контуром и делает его активным', () => {
    const { store, commands } = setup();
    commands.furniture.place(SOFA, 'Диван', [0, 0], 0);
    const id = commands.floors.add()!;
    const state = store.getState();
    expect(state.building.floors.map((f) => f.name)).toEqual(['1 этаж', '2 этаж']);
    expect(state.building.activeId).toBe(id);
    expect(state.editor.dimensions).toEqual({ width: 10, height: 3, depth: 8 });
    expect(state.furniture.items).toEqual([]);
    expect(state.building.stash['floor-1'].furniture).toHaveLength(1);
    expect(buildingSelectors.selectFloorFrames(state)[1].base).toBeCloseTo(3.3);
  });

  it('у каждого этажа своя мебель: переключение этажей не путает и не теряет её', () => {
    const { store, commands } = setup();
    commands.furniture.place(SOFA, 'Диван внизу', [0, 0], 0);
    const upper = commands.floors.add()!;
    commands.furniture.place(SOFA, 'Диван наверху', [2, 2], 0);
    expect(commands.floors.activate('floor-1')).toBe(true);
    expect(store.getState().furniture.items.map((f) => f.name)).toEqual(['Диван внизу']);
    commands.floors.activate(upper);
    expect(store.getState().furniture.items.map((f) => f.name)).toEqual(['Диван наверху']);
    expect(commands.floors.activate(upper)).toBe(false);
    const doc = selectSceneDocument(store.getState());
    expect(doc.floors.map((f) => f.furniture.map((i) => i.name))).toEqual([['Диван внизу'], ['Диван наверху']]);
  });

  it('смена этажа снимает выделение и не меняет документ сцены', () => {
    const { store, commands } = setup();
    commands.floors.add();
    commands.furniture.place(SOFA, 'Диван', [0, 0], 0);
    const before = JSON.stringify(selectSceneDocument(store.getState()));
    commands.floors.activate('floor-1');
    expect(JSON.stringify(selectSceneDocument(store.getState()))).toBe(before);
  });

  it('удаляет этаж; активным становится этаж ниже, последний этаж удалить нельзя', () => {
    const { store, commands, notify } = setup();
    const second = commands.floors.add()!;
    const third = commands.floors.add()!;
    expect(commands.floors.remove(third)).toBe(true);
    expect(store.getState().building.activeId).toBe(second);
    expect(commands.floors.remove('floor-1')).toBe(true);
    expect(store.getState().building.floors.map((f) => f.id)).toEqual([second]);
    expect(commands.floors.remove(second)).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('хотя бы один этаж'));
    expect(commands.floors.remove('nope')).toBe(false);
  });

  it('не больше пяти этажей', () => {
    const { store, commands, notify } = setup();
    for (let i = 0; i < 6; i += 1) commands.floors.add();
    expect(store.getState().building.floors).toHaveLength(5);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('не больше 5'));
  });

  it('переименовывает, смещает этаж и меняет толщину перекрытия с проверкой значений', () => {
    const { store, commands } = setup();
    expect(commands.floors.rename('floor-1', '  Цокольный  ')).toBe(true);
    expect(commands.floors.rename('floor-1', '   ')).toBe(false);
    expect(store.getState().building.floors[0].name).toBe('Цокольный');
    commands.floors.setOffset('floor-1', [500, -1]);
    expect(store.getState().building.floors[0].offset).toEqual([100, -1]);
    commands.floors.setSlabThickness(2);
    expect(store.getState().building.slabThickness).toBeCloseTo(0.6);
    commands.floors.setSlabThickness(Number.NaN);
    expect(store.getState().building.slabThickness).toBeCloseTo(0.6);
  });

  it('не утолщает перекрытие, если лестнице не хватит места, а с запасом — утолщает', () => {
    const { store, commands, notify } = setup({ width: 8, height: 3, depth: 5.2 });
    commands.floors.setSlabThickness(0.15);
    expect(commands.stairs.place('straight', [0, 0], 0)).not.toBeNull();
    expect(commands.floors.setSlabThickness(0.6)).toBe(false);
    expect(store.getState().building.slabThickness).toBeCloseTo(0.15);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('не хватит места при перекрытии 60 см'));
    expect(commands.floors.setSlabThickness(0.2)).toBe(true);
    expect(store.getState().building.slabThickness).toBeCloseTo(0.2);
  });

  it('при изменении размеров этажа мебель не выталкивается в проём лестницы снизу', () => {
    const { store, commands } = setup();
    commands.stairs.place('straight', [-4, 0], 0);
    commands.floors.add();
    const [cut] = buildingSelectors.selectCutoutsFromBelow(store.getState());
    commands.furniture.place(SOFA, 'Диван', [cut.maxX + 1, 0], 0);
    commands.room.dragWall('right', -2);
    const sofa = store.getState().furniture.items[0];
    const [moved] = buildingSelectors.selectCutoutsFromBelow(store.getState());
    expect(obbOverlap(furnitureFootprint(sofa), { center: [(moved.minX + moved.maxX) / 2, (moved.minZ + moved.maxZ) / 2], half: [(moved.maxX - moved.minX) / 2, (moved.maxZ - moved.minZ) / 2], angle: 0 }).overlapping).toBe(false);
  });

  it('при перетаскивании стены этаж смещается: противоположная стена и мебель стоят на месте в здании', () => {
    const { store, commands } = setup();
    commands.floors.add();
    commands.furniture.place(SOFA, 'Диван', [-3, 0], 0);
    const before = store.getState().furniture.items[0].position[0] + store.getState().building.floors[1].offset[0];
    commands.room.dragWall('right', 1);
    const state = store.getState();
    expect(state.editor.dimensions.width).toBeCloseTo(11);
    expect(state.building.floors[1].offset[0]).toBeCloseTo(0.5);
    expect(state.furniture.items[0].position[0] + state.building.floors[1].offset[0]).toBeCloseTo(before);
  });
});

describe('команды лестниц', () => {
  beforeEach(() => {
    furnitureSizesCache.set(SOFA, { halfWidth: 0.9, halfDepth: 0.43, height: 0.85 });
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('ставит лестницу вдоль ближайшей стены и выделяет её', () => {
    const { store, commands } = setup();
    const id = commands.stairs.place('straight', [-4.4, 0], null)!;
    const [stair] = store.getState().editor.stairs;
    expect(stair.id).toBe(id);
    expect(stair.rotation).toBe(0);
    expect(stair.position[0]).toBeCloseTo(-4.5);
    expect(store.getState().selection.current).toEqual({ kind: 'stair', id });
    expect(commands.stairs.rise()).toBeCloseTo(3.3);
  });

  it('сообщает, если марш не помещается на этаже', () => {
    const { store, commands, notify } = setup({ width: 4, height: 3, depth: 4 });
    expect(commands.stairs.place('straight', [0, 0], null)).toBeNull();
    expect(store.getState().editor.stairs).toEqual([]);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('не хватает места'));
  });

  it('мебель не встаёт на марш, а наверху — в проём над лестницей', () => {
    const { store, commands } = setup();
    commands.stairs.place('straight', [-4, 0], 0);
    const [stair] = store.getState().editor.stairs;
    const footprint = stairFootprint(stair, stairLayout(stair.kind, 3.3, stair.width));
    commands.furniture.place(SOFA, 'Диван', stair.position, 0);
    expect(obbOverlap(furnitureFootprint(store.getState().furniture.items[0]), footprint).overlapping).toBe(false);
    commands.floors.add();
    expect(buildingSelectors.selectCutoutsFromBelow(store.getState())).toHaveLength(1);
    commands.furniture.place(SOFA, 'Диван наверху', stair.position, 0);
    expect(obbOverlap(furnitureFootprint(store.getState().furniture.items[0]), footprint).overlapping).toBe(false);
  });

  it('двигает, вращает на 90°, меняет вариант и ширину, удаляет', () => {
    const { store, commands, notify } = setup({ width: 10, height: 3, depth: 10 });
    const id = commands.stairs.place('straight', [0, 0], 0)!;
    expect(commands.stairs.move(id, [1, 0.5])).toBe(true);
    expect(store.getState().editor.stairs[0].position).toEqual([1, 0.5]);
    commands.rotateSelection(0.1);
    expect(store.getState().editor.stairs[0].rotation).toBeCloseTo(Math.PI / 2);
    expect(commands.stairs.setKind(id, 'landing')).toBe(true);
    expect(commands.stairs.setKind(id, 'landing')).toBe(false);
    expect(commands.stairs.setWidth(id, 1.4)).toBe(true);
    expect(store.getState().editor.stairs[0]).toMatchObject({ kind: 'landing', width: 1.4 });
    commands.nudgeSelection(0.05, 0);
    expect(store.getState().editor.stairs[0].position[0]).toBeCloseTo(1.05);
    commands.deleteSelection();
    expect(store.getState().editor.stairs).toEqual([]);
    expect(commands.stairs.move(id, [0, 0])).toBe(false);
    expect(commands.stairs.rotate(id, 0)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('не даёт повернуть лестницу так, что она перестанет помещаться', () => {
    const { store, commands, notify } = setup({ width: 4, height: 3, depth: 8 });
    const id = commands.stairs.place('straight', [0, 0], 0)!;
    expect(commands.stairs.rotate(id, Math.PI / 2)).toBe(false);
    expect(store.getState().editor.stairs[0].rotation).toBe(0);
    expect(notify).toHaveBeenCalled();
  });

  it('предупреждает, если над вырезом на этаже выше стоит мебель', () => {
    const { commands, notify } = setup();
    const upper = commands.floors.add()!;
    commands.furniture.place(SOFA, 'Диван', [-3.5, 0], Math.PI / 2);
    commands.floors.activate('floor-1');
    commands.stairs.place('straight', [-4, 0], 0);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Над лестницей на этаже выше'));
    expect(upper).toBeTruthy();
  });

  it('предпросмотр показывает, помещается ли лестница', () => {
    const { commands } = setup();
    expect(commands.stairs.preview('straight', [0, 0], 0).valid).toBe(true);
    expect(commands.stairs.preview('landing', [0, 0], Math.PI / 2).stair.rotation).toBeCloseTo(Math.PI / 2);
  });
});
