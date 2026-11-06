import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { reducer as buildingReducer } from '@/features/editor-3d/building/slice';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { KNOWN_MODEL_SIZES, MODELS } from '@/features/furniture/lib/knownSizes';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import type { FurnitureItem } from '@/features/furniture/types';
import { SelectionFeature } from '@/features/selection';
import { sceneLoadActions } from '../../sceneActions';
import { createEmptyScene } from '../../lib/scene/build';
import { MAX_TWIST } from '../../lib/cushionSeats';
import type { Ray3 } from '../../lib/surfaces';
import { interaction, interactionStore } from '../interactionStore';
import { createSceneCommands } from './index';

const PILLOW = '/assets/models/pillow_linen_sand/pillow_linen_sand.gltf';
const SET = '/assets/models/throw_pillows_01/throw_pillows_01_1k.gltf';

function setup(furniture: FurnitureItem[] = []) {
  const store = configureStore({
    reducer: { editor: editorReducer, building: buildingReducer, furniture: furnitureReducer, ...SelectionFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }),
  });
  const scene = createEmptyScene({ width: 5, height: 2.7, depth: 5 });
  sceneLoadActions({ ...scene, floors: [{ ...scene.floors[0], furniture }] }).forEach((a) => store.dispatch(a));
  const notify = vi.fn();
  const commands = createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify });
  const get = (id: string) => store.getState().furniture.items.find((i) => i.id === id)!;
  return { store, commands, notify, get };
}

const at = (id: string, path: string, x: number, z: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: path,
  position: [x, 0, z],
  rotation: [0, 0, 0],
  scale: 1,
  ...KNOWN_MODEL_SIZES[path],
  ...extra,
});

/** Диван у задней стены: сиденье от z ≈ -1.33 до -0.67. */
const sofa = () => at('sofa', MODELS.sofa, 0, -1);
const down = (x: number, z: number): Ray3 => ({ origin: [x, 3, z], direction: [0, -1, 0] });
const placePillow = (commands: ReturnType<typeof setup>['commands'], x: number, z: number) =>
  commands.furniture.place(PILLOW, 'Подушка льняная', [x, z], null, { ray: down(x, z) });

describe('подушки на диване', () => {
  beforeEach(() => {
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('брошенная на диван подушка садится в ближайшее место у спинки с наклоном', () => {
    const { commands, get } = setup([sofa()]);
    const pillow = get(placePillow(commands, -0.42, -1.2)!);
    expect(pillow).toMatchObject({ supportId: 'sofa', socket: 'back-1' });
    expect(pillow.position[1]).toBeCloseTo(0.38);
    expect(pillow.rotation[0]).toBeLessThan(0);
    expect(pillow.position[2]).toBeGreaterThan(-1.33);
  });

  it('призрак показывает место и наклон; когда все места заняты — красный, а установка отказывается', () => {
    const { commands, notify } = setup([sofa()]);
    const ghost = commands.furniture.previewPlacement(PILLOW, [0, -1.2], null, { name: 'Подушка', aim: { ray: down(0, -1.2) } });
    expect(ghost).toMatchObject({ supportId: 'sofa', socket: 'back-2', valid: true });
    expect(ghost.tilt).toBeGreaterThan(0);
    for (let i = 0; i < 5; i += 1) expect(placePillow(commands, 0, -1.1)).not.toBeNull();
    expect(commands.furniture.previewPlacement(PILLOW, [0, -1.2], null, { aim: { ray: down(0, -1.2) } }).valid).toBe(false);
    expect(placePillow(commands, 0, -1.1)).toBeNull();
    expect(notify).toHaveBeenCalledWith('Все места для подушек здесь заняты');
  });

  it('установка по клику садит подушку в место, выбранное призраком', () => {
    const { commands, get } = setup([sofa()]);
    const id = commands.furniture.place(PILLOW, 'Подушка', [0.3, -0.9], null, { supportId: 'sofa', socket: 'seat-2' })!;
    expect(get(id).socket).toBe('seat-2');
    expect(get(id).rotation[0]).toBeCloseTo(-Math.PI / 2);
  });

  it('диван переносит и поворачивает подушки, наклон сохраняется', () => {
    const { commands, get } = setup([sofa()]);
    const id = placePillow(commands, -0.42, -1.2)!;
    const before = get(id);
    expect(commands.furniture.move('sofa', [0.5, -0.5])).toBe(true);
    expect(get(id).position[0]).toBeCloseTo(before.position[0] + 0.5);
    expect(get(id).position[2]).toBeCloseTo(before.position[2] + 0.5);
    expect(commands.furniture.rotate('sofa', Math.PI / 2)).toBe(true);
    expect(get(id).rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(get(id).rotation[0]).toBeCloseTo(before.rotation[0]);
    expect(get(id).socket).toBe('back-1');
  });

  it('подушку стягивают с дивана на пол — без места и наклона; обратно на диван — садится', () => {
    const { commands, get } = setup([sofa()]);
    const id = placePillow(commands, -0.42, -1.2)!;
    expect(commands.furniture.move(id, [1.2, 1])).toBe(true);
    expect(get(id).supportId).toBeUndefined();
    expect(get(id).socket).toBeUndefined();
    expect(get(id).rotation[0]).toBe(0);
    expect(get(id).position[1]).toBe(0);
    expect(commands.furniture.move(id, [0.42, -1.2], { ray: down(0.42, -1.2) })).toBe(true);
    expect(get(id)).toMatchObject({ supportId: 'sofa', socket: 'back-3' });
  });

  it('удаление дивана кладёт подушки на пол, кнопка «Снять на пол» — тоже', () => {
    const { commands, get, store } = setup([sofa()]);
    const a = placePillow(commands, -0.42, -1.2)!;
    const b = placePillow(commands, 0.42, -1.2)!;
    commands.furniture.dropToFloor(b);
    expect(get(b).socket).toBeUndefined();
    commands.furniture.remove('sofa');
    const left = store.getState().furniture.items.find((i) => i.id === a)!;
    expect(left.supportId).toBeUndefined();
    expect(left.rotation[0]).toBe(0);
    expect(left.position[1]).toBe(0);
  });

  it('поворот подушки в месте — лёгкий доворот не больше ±35°', () => {
    const { commands, get } = setup([sofa()]);
    const id = placePillow(commands, -0.42, -1.2)!;
    const seat = get(id).position;
    expect(commands.furniture.rotate(id, 0.2)).toBe(true);
    expect(get(id).rotation[1]).toBeCloseTo(0.2);
    commands.furniture.rotateBy(id, Math.PI / 2);
    expect(get(id).rotation[1]).toBeCloseTo(MAX_TWIST);
    expect(get(id).socket).toBe('back-1');
    expect(get(id).position[1]).toBeCloseTo(seat[1]);
  });

  it('масштаб дивана раздвигает подушки вместе с местами; копия подушки садится в свободное место', () => {
    const { commands, get, store } = setup([sofa()]);
    const id = placePillow(commands, -0.42, -1.2)!;
    const x = get(id).position[0];
    expect(commands.furniture.setScale('sofa', 1.2)).toBe(true);
    expect(get(id).position[0]).toBeCloseTo(x * 1.2, 2);
    expect(get(id).position[1]).toBeCloseTo(0.38 * 1.2);
    const copy = commands.furniture.duplicate(id)!;
    expect(get(copy).supportId).toBe('sofa');
    expect(get(copy).socket).not.toBe('back-1');
    expect(store.getState().furniture.items.filter((i) => i.supportId === 'sofa')).toHaveLength(2);
  });

  it('масштаб подушки в месте — пока помещается; набор подушек в кресло не садится', () => {
    const { commands, get, notify } = setup([sofa(), at('armchair', MODELS.armchair, 1.5, 1)]);
    const id = placePillow(commands, -0.42, -1.2)!;
    expect(commands.furniture.setScale(id, 1.1)).toBe(true);
    expect(get(id).scale).toBeCloseTo(1.1);
    expect(commands.furniture.setScale(id, 4)).toBe(false);
    expect(notify).toHaveBeenCalledWith('Подушка такого размера не помещается на этом месте');
    const set = commands.furniture.place(SET, 'Декоративные подушки', [1.5, 1], null, { ray: down(1.5, 1) })!;
    expect(get(set).socket).toBeUndefined();
  });
});
