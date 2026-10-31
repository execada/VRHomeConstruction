import { describe, expect, it } from 'vitest';
import { actions, reducer } from './slice';
import type { FurnitureItem } from './types';

const item = (id: string, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: 'Стул',
  modelPath: 'primitive:stool',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  ...extra,
});

const initial = () => reducer(undefined, { type: 'init' });

describe('furniture slice', () => {
  it('добавляет, обновляет (вместе с выделенным) и удаляет предмет', () => {
    let state = reducer(initial(), actions.addFurniture(item('a')));
    state = reducer(state, actions.selectFurniture('a'));
    state = reducer(state, actions.updateFurniture(item('a', { name: 'Кресло' })));
    expect(state.items[0].name).toBe('Кресло');
    expect(state.selectedFurniture?.name).toBe('Кресло');

    state = reducer(state, actions.removeFurniture('a'));
    expect(state.items).toHaveLength(0);
    expect(state.selectedFurniture).toBeNull();
    expect(state.showFurnitureModal).toBe(false);
  });

  it('дублирует предмет со смещением и выделяет копию; несуществующий id игнорируется', () => {
    let state = reducer(initial(), actions.addFurniture(item('a', { position: [1, 0, 1] })));
    state = reducer(state, actions.duplicateFurniture('a'));
    expect(state.items).toHaveLength(2);
    expect(state.items[1].id).not.toBe('a');
    expect(state.items[1].position).toEqual([1.4, 0, 1.4]);
    expect(state.selectedFurniture?.id).toBe(state.items[1].id);
    expect(reducer(state, actions.duplicateFurniture('missing'))).toEqual(state);
  });

  it('выбор и закрытие модалки, путь размещения', () => {
    let state = reducer(initial(), actions.addFurniture(item('a')));
    state = reducer(state, actions.selectFurniture('missing'));
    expect(state.selectedFurniture).toBeNull();
    expect(state.showFurnitureModal).toBe(true);
    state = reducer(state, actions.selectFurniture(null));
    expect(state.showFurnitureModal).toBe(false);
    state = reducer(state, actions.selectFurniture('a'));
    state = reducer(state, actions.hideFurnitureModal());
    expect(state.selectedFurniture).toBeNull();
    state = reducer(state, actions.setSelectedFurniturePath('primitive:sofa'));
    expect(state.selectedFurniturePath).toBe('primitive:sofa');
  });

  it('измеренные размеры не сдвигают предмет по высоте', () => {
    let state = reducer(initial(), actions.addFurniture(item('a', { position: [0, 0.75, 0] })));
    state = reducer(state, actions.selectFurniture('a'));
    const sizes = { halfWidth: 0.3, halfDepth: 0.25, height: 0.9 };
    state = reducer(state, actions.setFurnitureReady({ itemId: 'a', sizes }));
    state = reducer(state, actions.updateFurnitureSizes({ itemId: 'a', sizes }));
    expect(state.items[0]).toMatchObject({ ...sizes, position: [0, 0.75, 0] });
    expect(state.selectedFurniture).toMatchObject(sizes);
  });

  it('загрузка, замена и сброс', () => {
    let state = reducer(initial(), actions.loadFurniture([item('a'), item('b')]));
    state = reducer(state, actions.replaceFurniture([item('c')]));
    expect(state.items.map((i) => i.id)).toEqual(['c']);
    expect(reducer(state, actions.resetFurniture())).toEqual(initial());
  });
});
