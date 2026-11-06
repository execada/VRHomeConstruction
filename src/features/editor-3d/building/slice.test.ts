import { describe, expect, it } from 'vitest';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import type { FurnitureItem } from '@/features/furniture/types';
import { createEmptyFloor, toEditorPayload } from '../lib/scene/build';
import { reducer as editorReducer } from '../slice';
import type { FloorContent } from '../types';
import { actions, reducer } from './slice';

const chair = (id: string): FurnitureItem => ({ id, name: 'Стул', modelPath: 'primitive:stool', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });
const content = (width: number, furniture: FurnitureItem[] = []): FloorContent => ({
  ...toEditorPayload(createEmptyFloor({ width, height: 3, depth: 4 })),
  furniture,
});
const initial = () => reducer(undefined, { type: 'init' });

describe('building slice', () => {
  it('начинает с одного этажа', () => {
    expect(initial()).toMatchObject({ floors: [{ id: 'floor-1', name: '1 этаж', offset: [0, 0] }], activeId: 'floor-1', stash: {} });
  });

  it('добавление этажа убирает активный в stash и делает новый активным', () => {
    const lower = content(5, [chair('a')]);
    const state = reducer(initial(), actions.floorAdded({ floor: { id: 'f2', name: '2 этаж', offset: [0, 0] }, index: 1, outgoing: lower, incoming: content(5) }));
    expect(state.floors.map((f) => f.id)).toEqual(['floor-1', 'f2']);
    expect(state.activeId).toBe('f2');
    expect(state.stash['floor-1']).toBe(lower);
  });

  it('смена этажа меняет местами активный и сохранённый', () => {
    const upper = content(6, [chair('b')]);
    let state = reducer(initial(), actions.floorAdded({ floor: { id: 'f2', name: '2 этаж', offset: [0, 0] }, index: 1, outgoing: content(5), incoming: content(5) }));
    state = reducer(state, actions.floorActivated({ id: 'floor-1', outgoing: upper, incoming: state.stash['floor-1'] }));
    expect(state.activeId).toBe('floor-1');
    expect(state.stash.f2).toBe(upper);
    expect(state.stash['floor-1']).toBeUndefined();
  });

  it('удаление: неактивный этаж — из stash, активный — с загрузкой следующего; единственный не удаляется', () => {
    let state = reducer(initial(), actions.floorAdded({ floor: { id: 'f2', name: '2 этаж', offset: [0, 0] }, index: 1, outgoing: content(5), incoming: content(5) }));
    expect(reducer(state, actions.floorRemoved({ id: 'floor-1' })).floors.map((f) => f.id)).toEqual(['f2']);
    state = reducer(state, actions.floorRemoved({ id: 'f2', next: { id: 'floor-1', incoming: state.stash['floor-1'] } }));
    expect(state.activeId).toBe('floor-1');
    expect(state.stash).toEqual({});
    expect(reducer(state, actions.floorRemoved({ id: 'floor-1' })).floors).toHaveLength(1);
    expect(reducer(state, actions.floorRemoved({ id: 'nope' }))).toBe(state);
  });

  it('переименование, смещение, перекрытие, загрузка и сброс', () => {
    let state = reducer(initial(), actions.floorRenamed({ id: 'floor-1', name: 'Цоколь' }));
    state = reducer(state, actions.floorOffsetSet({ id: 'floor-1', offset: [1, 2] }));
    state = reducer(state, actions.slabThicknessSet(0.4));
    expect(state).toMatchObject({ floors: [{ name: 'Цоколь', offset: [1, 2] }], slabThickness: 0.4 });
    const loaded = { floors: [{ id: 'x', name: 'X', offset: [0, 0] as [number, number] }], activeId: 'x', stash: {}, slabThickness: 0.2 };
    expect(reducer(state, actions.loaded(loaded))).toEqual(loaded);
    expect(reducer(state, actions.reset())).toEqual(initial());
  });

  it('редактор и мебель загружают содержимое нового активного этажа тем же действием', () => {
    const incoming = content(7, [chair('up')]);
    const added = actions.floorAdded({ floor: { id: 'f2', name: '2 этаж', offset: [0, 0] }, index: 1, outgoing: content(5), incoming });
    expect(editorReducer(undefined, added).dimensions.width).toBe(7);
    expect(furnitureReducer(undefined, added).items.map((i) => i.id)).toEqual(['up']);
    const swap = actions.floorActivated({ id: 'floor-1', outgoing: incoming, incoming: content(5, [chair('down')]) });
    expect(furnitureReducer(undefined, swap).items.map((i) => i.id)).toEqual(['down']);
    expect(editorReducer(undefined, swap).dimensions.width).toBe(5);
    const removed = actions.floorRemoved({ id: 'f2', next: { id: 'floor-1', incoming: content(9) } });
    expect(editorReducer(undefined, removed).dimensions.width).toBe(9);
    const editor = editorReducer(undefined, { type: 'init' });
    expect(editorReducer(editor, actions.floorRemoved({ id: 'f2' }))).toBe(editor);
    const furniture = furnitureReducer(undefined, { type: 'init' });
    expect(furnitureReducer(furniture, actions.floorRemoved({ id: 'f2' }))).toBe(furniture);
  });
});
