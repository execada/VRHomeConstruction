import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { reducer as buildingReducer } from '@/features/editor-3d/building/slice';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { KNOWN_MODEL_SIZES, MODELS } from '@/features/furniture/lib/knownSizes';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import { furnitureSurfacesCache } from '@/features/furniture/surfacesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { SelectionFeature } from '@/features/selection';
import { sceneLoadActions } from '../../sceneActions';
import { createEmptyScene } from '../../lib/scene/build';
import { WALL_GAP } from '../../lib/wallMount';
import type { Ray3 } from '../../lib/surfaces';
import { interaction, interactionStore } from '../interactionStore';
import { createSceneCommands } from './index';

const M = '/assets/models';
const PICTURE = `${M}/hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf`;
const SHELF = `${M}/wall_shelf_oak/wall_shelf_oak.gltf`;
const CHANDELIER = `${M}/Chandelier_01/Chandelier_01_1k.gltf`;
const PIC = KNOWN_MODEL_SIZES[PICTURE];

/** Комната 5 × 4 м, потолок 2,7 м: задняя стена z = -2, левая x = -2.5. */
function setup(furniture: FurnitureItem[] = []) {
  const store = configureStore({
    reducer: { editor: editorReducer, building: buildingReducer, furniture: furnitureReducer, ...SelectionFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }),
  });
  const scene = createEmptyScene({ width: 5, height: 2.7, depth: 4 });
  sceneLoadActions({ ...scene, floors: [{ ...scene.floors[0], furniture }] }).forEach((a) => store.dispatch(a));
  const notify = vi.fn();
  const commands = createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify });
  const get = (id: string) => store.getState().furniture.items.find((i) => i.id === id)!;
  return { store, commands, notify, get };
}

const item = (id: string, path: string, x: number, z: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: path,
  position: [x, 0, z],
  rotation: [0, 0, 0],
  scale: 1,
  ...KNOWN_MODEL_SIZES[path],
  ...extra,
});

/** Луч от первого лица на высоте глаз вперёд (к задней стене). */
const look = (x: number, y = 1.5, dir: [number, number, number] = [0, 0, -1]): Ray3 => ({ origin: [x, y, 1], direction: dir });
const hangPicture = (commands: ReturnType<typeof setup>['commands'], x = 0) =>
  commands.furniture.place(PICTURE, 'Постер в чёрной раме', [x, 0], null, { ray: look(x) })!;

describe('настенные предметы', () => {
  beforeEach(() => {
    if (interactionStore.getState().gridEnabled) interaction.toggleGrid();
  });

  it('призрак картины встаёт на стену под лучом на высоту из каталога', () => {
    const { commands } = setup();
    const ghost = commands.furniture.previewPlacement(PICTURE, [0.4, 0], null, { aim: { ray: look(0.4) } });
    expect(ghost).toMatchObject({ valid: true, mount: 'back', angle: 0 });
    expect(ghost.center[0]).toBeCloseTo(0.4);
    expect(ghost.center[1]).toBeCloseTo(-2 + PIC.halfDepth + WALL_GAP);
    expect(ghost.elevation).toBeCloseTo(1.5 - PIC.height / 2);
  });

  it('в середине большой комнаты без луча стены нет — призрак красный, установка отказывается', () => {
    const { commands, notify } = setup();
    const ghost = commands.furniture.previewPlacement(PICTURE, [0, 0.2], null, {});
    expect(ghost).toMatchObject({ valid: false, mount: null });
    expect(commands.furniture.place(PICTURE, 'Постер', [0, 0.2], null, {})).toBeNull();
    expect(notify).toHaveBeenCalledWith('Настенный предмет вешается на стену — наведите курсор на стену');
  });

  it('картина висит на стене; перетаскивание ведёт её по стене и на другую стену', () => {
    const { commands, get } = setup();
    const id = hangPicture(commands);
    expect(get(id)).toMatchObject({ mount: 'back' });
    // Луч на левую стену, точка захвата — центр картины
    expect(commands.furniture.move(id, [-2, 0], { ray: { origin: [0, 1.8, 0], direction: [-1, 0, -0.2] }, wallOffset: [0, 0] })).toBe(true);
    const left = get(id);
    expect(left.mount).toBe('left');
    expect(left.position[0]).toBeCloseTo(-2.5 + PIC.halfDepth + WALL_GAP);
    expect(left.position[1]).toBeCloseTo(1.8 - PIC.height / 2);
    expect(left.rotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('на плане (без луча) картина скользит вдоль ближайшей стены на той же высоте', () => {
    const { commands, get } = setup();
    const id = hangPicture(commands);
    const y = get(id).position[1];
    expect(commands.furniture.move(id, [1.2, -1.5])).toBe(true);
    expect(get(id).position[0]).toBeCloseTo(1.2);
    expect(get(id).position[1]).toBeCloseTo(y);
    expect(get(id).mount).toBe('back');
    // Отвели далеко от стен — остаётся на месте
    expect(commands.furniture.move(id, [0, 0.5])).toBe(false);
  });

  it('обходит окно и высокий шкаф, но висит над диваном', () => {
    const { commands, get } = setup([item('sofa', MODELS.sofa, 0, -1.6), item('wardrobe', '/models/wardrobe.glb', 1.5, -1.7, { name: 'Шкаф', halfWidth: 0.5, halfDepth: 0.3, height: 2.2 })]);
    expect(commands.openings.add('back', 'window', -1.2)).not.toBeNull();
    const above = hangPicture(commands, 0);
    expect(get(above).position[0]).toBeCloseTo(0);
    const near = hangPicture(commands, 1.4);
    expect(Math.abs(get(near).position[0] - 1.5)).toBeGreaterThan(0.5 + PIC.halfWidth - 0.01);
    const byWindow = hangPicture(commands, -1.2);
    expect(get(byWindow).mount).toBe('back');
    expect(Math.abs(get(byWindow).position[0] + 1.2)).toBeGreaterThan(0.6 + PIC.halfWidth);
  });

  it('повернуть нельзя; высота и масштаб меняются на той же стене; копия — рядом', () => {
    const { commands, get, notify, store } = setup();
    const id = hangPicture(commands);
    expect(commands.furniture.rotateBy(id, Math.PI / 2)).toBe(false);
    expect(notify).toHaveBeenCalledWith('Настенный предмет висит фасадом в комнату — его поворачивает стена');
    commands.furniture.setElevation(id, 0.9);
    expect(get(id).position[1]).toBeCloseTo(0.9);
    commands.furniture.setElevation(id, 5);
    expect(get(id).position[1]).toBeCloseTo(2.7 - PIC.height);
    commands.furniture.setElevation(id, 1);
    const center = get(id).position[1] + PIC.height / 2;
    expect(commands.furniture.setScale(id, 1.2)).toBe(true);
    expect(get(id).position[1] + (PIC.height * 1.2) / 2).toBeCloseTo(center);
    const copy = commands.furniture.duplicate(id)!;
    expect(get(copy).mount).toBe('back');
    expect(Math.abs(get(copy).position[0] - get(id).position[0])).toBeGreaterThanOrEqual(PIC.halfWidth * 2 * 1.2);
    expect(store.getState().furniture.items).toHaveLength(2);
  });

  it('полка на стене переносит вазу на себе', () => {
    furnitureSurfacesCache.set(SHELF, [{ y: 0.195, minX: -0.4, maxX: 0.4, minZ: -0.11, maxZ: 0.11, clearance: Infinity }]);
    const { commands, get } = setup();
    const shelf = commands.furniture.place(SHELF, 'Полка настенная', [0, 0], null, { ray: look(0) })!;
    const top = get(shelf).position[1] + 0.195;
    const vase = commands.furniture.place(MODELS.vase, 'Керамическая ваза', [0, -1.89], null, { ray: { origin: [0, 2.5, -1.89], direction: [0, -1, 0] } })!;
    expect(get(vase).supportId).toBe(shelf);
    expect(get(vase).position[1]).toBeCloseTo(top);
    expect(commands.furniture.move(shelf, [1, -1.8])).toBe(true);
    expect(get(vase).position[0]).toBeCloseTo(1);
  });
});

describe('потолочные предметы', () => {
  it('люстра висит под потолком, вращается, высоту не меняет', () => {
    const { commands, get, notify } = setup();
    const id = commands.furniture.place(CHANDELIER, 'Люстра', [0.5, 0.3], null, {})!;
    const lamp = get(id);
    expect(lamp.mount).toBe('ceiling');
    expect(lamp.position[1]).toBeCloseTo(2.7 - KNOWN_MODEL_SIZES[CHANDELIER].height);
    expect(commands.furniture.rotate(id, 0.5)).toBe(true);
    expect(get(id).rotation[1]).toBeCloseTo(0.5);
    commands.furniture.setElevation(id, 1);
    expect(notify).toHaveBeenCalledWith('Потолочный предмет висит под потолком');
    expect(get(id).position[1]).toBeCloseTo(lamp.position[1]);
  });

  it('поднимается вместе с потолком при изменении высоты комнаты', () => {
    const { commands, get } = setup();
    const id = commands.furniture.place(CHANDELIER, 'Люстра', [0, 0], null, {})!;
    commands.room.resize({ width: 5, height: 3.2, depth: 4 });
    expect(get(id).position[1]).toBeCloseTo(3.2 - KNOWN_MODEL_SIZES[CHANDELIER].height);
  });
});

describe('стены меняются — картины остаются на них', () => {
  it('картина едет с перегородкой и перевешивается на стену, когда перегородку удаляют', () => {
    const { commands, get, store } = setup();
    const wall = commands.partitions.add([0, -0.5], 0)!;
    const id = commands.furniture.place(PICTURE, 'Постер', [0, 0], null, { ray: look(0) })!;
    expect(get(id).mount).toBe(`${wall}:a`);
    commands.partitions.move(wall, [0, 0]);
    commands.partitions.endGesture();
    const thickness = store.getState().editor.partitions[0].size[2];
    expect(get(id).position[2]).toBeCloseTo(thickness / 2 + PIC.halfDepth + WALL_GAP);
    commands.partitions.remove(wall);
    expect(['back', 'front', 'left', 'right']).toContain(get(id).mount);
  });

  it('картина остаётся на внешней стене, когда комнату растягивают', () => {
    const { commands, get, store } = setup();
    const id = hangPicture(commands);
    commands.room.dragWall('back', 1);
    expect(store.getState().editor.dimensions.depth).toBeCloseTo(5);
    expect(get(id).mount).toBe('back');
    expect(get(id).position[2]).toBeCloseTo(-2.5 + PIC.halfDepth + WALL_GAP);
  });

  it('картины старых проектов (без места подвеса) не трогаются', () => {
    const old = item('old', PICTURE, 0, 0.5);
    const { commands, get } = setup([old]);
    commands.partitions.add([1, 1], 0);
    commands.partitions.endGesture();
    expect(get('old').position).toEqual(old.position);
  });
});
