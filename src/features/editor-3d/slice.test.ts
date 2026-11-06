import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, uniformOuterWalls } from './constants';
import { createEmptyScene } from './lib/scene/build';
import { actions, reducer } from './slice';
import type { Opening, Partition, SurfaceFinish } from './types';

const initial = () => reducer(undefined, { type: 'init' });

const opening = (id: string, wallId = 'front'): Opening => ({ id, wallId, type: 'window', position: [0, 1.5], width: 1.2, height: 1.4 });

const partition = (id: string): Partition => ({
  id,
  position: [0, 1.5, 0],
  rotation: [0, 0, 0],
  size: [2, 3, 0.1],
  openings: [],
});

const finish = (color: string): SurfaceFinish => ({ textureId: null, color, scale: 1 });

describe('editor slice: комната и вид', () => {
  it('меняет размеры, цвета, материалы, свет, режим и инструмент', () => {
    let state = initial();
    state = reducer(state, actions.setDimensions({ width: 5, height: 2.7, depth: 4 }));
    state = reducer(state, actions.setColors({ walls: '#111111', floor: '#222222', ceiling: '#333333' }));
    state = reducer(state, actions.setMaterial({ surface: 'floor', id: 'oak' }));
    state = reducer(state, actions.setLight({ ...DEFAULT_LIGHT, intensity: 2 }));
    state = reducer(state, actions.setViewMode('2d'));
    state = reducer(state, actions.setActiveTool('door'));
    state = reducer(state, actions.setViewedWallId('left'));
    state = reducer(state, actions.setCurrentProjectId('p1'));
    state = reducer(state, actions.setPlayerPosition([1, 1.6, 2]));
    state = reducer(state, actions.setPlayerRotation([0, 1, 0]));
    expect(state).toMatchObject({
      dimensions: { width: 5, height: 2.7, depth: 4 },
      colors: { walls: '#111111' },
      viewMode: '2d',
      activeTool: 'door',
      viewedWallId: 'left',
      currentProjectId: 'p1',
      playerPosition: [1, 1.6, 2],
      playerRotation: [0, 1, 0],
    });
    expect(state.materials.floor).toBe('oak');
    expect(state.light.intensity).toBe(2);
  });

  it('отделка: пол, одна стена и все стены сразу', () => {
    let state = initial();
    state = reducer(state, actions.setFinish({ target: 'floor', finish: finish('#aaaaaa') }));
    state = reducer(state, actions.setFinish({ target: 'left', finish: finish('#bbbbbb') }));
    expect(state.finishes.floor.color).toBe('#aaaaaa');
    expect(state.finishes.walls.left.color).toBe('#bbbbbb');
    expect(state.finishes.walls.right.color).not.toBe('#bbbbbb');

    state = reducer(state, actions.setFinish({ target: 'walls', finish: finish('#cccccc') }));
    expect(Object.values(state.finishes.walls).map((f) => f.color)).toEqual(['#cccccc', '#cccccc', '#cccccc', '#cccccc']);
  });

  it('толщина стен, скрытые стены и сброс', () => {
    let state = initial();
    state = reducer(state, actions.setOuterWalls(uniformOuterWalls(0.3, 'aerated')));
    state = reducer(state, actions.setRemovedWalls(['front']));
    expect(state.outerWalls.left).toEqual({ thickness: 0.3, material: 'aerated' });
    expect(state.removedWalls).toEqual(['front']);
    expect(reducer(state, actions.resetEditor())).toEqual(initial());
  });
});

describe('editor slice: проёмы', () => {
  it('добавляет, обновляет и удаляет проём; пустая стена убирается из словаря', () => {
    let state = reducer(initial(), actions.addOpening({ wallId: 'front', opening: opening('o1') }));
    state = reducer(state, actions.updateOpening({ wallId: 'front', opening: { ...opening('o1'), width: 2 } }));
    expect(state.openings.front[0].width).toBe(2);

    state = reducer(state, actions.updateOpening({ wallId: 'missing', opening: opening('o1') }));
    state = reducer(state, actions.removeOpening({ wallId: 'front', openingId: 'o1' }));
    expect(state.openings.front).toBeUndefined();
    expect(reducer(state, actions.removeOpening({ wallId: 'front', openingId: 'o1' }))).toEqual(state);
  });

  it('выделение и запросы на создание/удаление не меняют данные', () => {
    let state = reducer(initial(), actions.setSelectedOpening({ wallId: 'front', openingId: 'o1' } as never));
    expect(state.selectedOpening).toEqual({ wallId: 'front', openingId: 'o1' });
    const before = state;
    state = reducer(state, actions.createOpeningRequested({ wallId: 'front', point: { x: 0, y: 0 } }));
    state = reducer(state, actions.deleteOpeningRequested({ openingId: 'o1' }));
    expect(state).toBe(before);
  });

  it('заменяет все проёмы', () => {
    const state = reducer(initial(), actions.setOpenings({ back: [opening('o2', 'back')] }));
    expect(Object.keys(state.openings)).toEqual(['back']);
  });
});

describe('editor slice: перегородки', () => {
  it('добавляет, обновляет выделенную и удаляет вместе с цветом и выделением', () => {
    let state = reducer(initial(), actions.addPartition(partition('p1')));
    state = reducer(state, actions.setSelectedPartition(partition('p1')));
    state = reducer(state, actions.setPartitionColor({ partitionId: 'p1', color: '#123456' }));
    state = reducer(state, actions.updatePartition({ ...partition('p1'), size: [3, 3, 0.1] }));
    expect(state.selectedPartition?.size[0]).toBe(3);
    expect(state.partitionColors.p1).toBe('#123456');

    state = reducer(state, actions.removePartition('p1'));
    expect(state.partitions).toHaveLength(0);
    expect(state.partitionColors.p1).toBeUndefined();
    expect(state.selectedPartition).toBeNull();
  });

  it('проёмы внутри перегородки', () => {
    let state = reducer(initial(), actions.addPartition(partition('p1')));
    state = reducer(state, actions.addOpeningToPartition({ partitionId: 'p1', opening: opening('d1', 'p1') }));
    state = reducer(state, actions.addOpeningToPartition({ partitionId: 'nope', opening: opening('d2', 'nope') }));
    expect(state.partitions[0].openings.map((o) => o.id)).toEqual(['d1']);
    state = reducer(state, actions.removeOpeningFromPartition({ partitionId: 'p1', openingId: 'd1' }));
    state = reducer(state, actions.removeOpeningFromPartition({ partitionId: 'nope', openingId: 'd1' }));
    expect(state.partitions[0].openings).toHaveLength(0);
  });

  it('удаление цвета и замена всех перегородок', () => {
    let state = reducer(initial(), actions.setPartitionColor({ partitionId: 'p9', color: '#000000' }));
    state = reducer(state, actions.removePartitionColor('p9'));
    state = reducer(state, actions.setPartitions([partition('a'), partition('b')]));
    expect(state.partitionColors).toEqual({});
    expect(state.partitions.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('editor slice: загрузка сцены', () => {
  it('loadScene заменяет сцену и снимает выделение', () => {
    const [doc] = createEmptyScene({ width: 6, height: 3, depth: 5 }).floors;
    let state = reducer(initial(), actions.setSelectedPartition(partition('p1')));
    state = reducer(
      state,
      actions.loadScene({
        dimensions: doc.dimensions,
        finishes: doc.finishes,
        outerWalls: doc.outerWalls,
        removedWalls: doc.removedWalls,
        light: doc.light,
        openings: {},
        partitions: [],
        rooms: [{ id: 'r', name: 'Кухня', anchor: [0, 0] }],
        stairs: [{ id: 's', kind: 'straight', position: [0, 0], rotation: 0, width: 1 }],
      }),
    );
    expect(state.rooms[0].name).toBe('Кухня');
    expect(state.stairs.map((s) => s.id)).toEqual(['s']);
    expect(state.dimensions.width).toBe(6);
    expect(state.selectedPartition).toBeNull();
    expect(state.selectedOpening).toBeNull();
  });

  it('loadRoomData (формат v1) подставляет материалы по умолчанию', () => {
    const state = reducer(
      initial(),
      actions.loadRoomData({
        dimensions: { width: 3, height: 2.5, depth: 3 },
        colors: { walls: '#ffffff', floor: '#000000', ceiling: '#ffffff' },
        light: DEFAULT_LIGHT,
        openings: { front: [opening('o1')] },
        partitions: [],
        partitionColors: {},
      }),
    );
    expect(state.dimensions.width).toBe(3);
    expect(state.materials).toEqual(initial().materials);
    expect(state.openings.front).toHaveLength(1);
  });
});
