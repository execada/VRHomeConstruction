import { describe, expect, it } from 'vitest';
import { createPartition, partitionFromEndpoints } from './lib/partitions';
import { selectRooms, selectWallLayout } from './layoutSelectors';
import { reducer } from './slice';

const dims = { width: 6, height: 3, depth: 4 };

function state(labels = [] as Array<{ id: string; name: string; anchor: [number, number] }>) {
  const wall = partitionFromEndpoints(createPartition({ id: 'w', center: [0, 0], dims }), [1, -2], [1, 2], dims);
  const editor = { ...reducer(undefined, { type: 'init' }), dimensions: dims, partitions: [wall], rooms: labels };
  return { editor };
}

describe('layout selectors', () => {
  it('derives joints and named rooms from the editor state', () => {
    const s = state([{ id: 'k', name: 'Кухня', anchor: [2, 0] }]);
    expect(selectWallLayout(s).outer.back).toHaveLength(1);
    const rooms = selectRooms(s);
    expect(rooms.map((r) => r.name).sort()).toEqual(['Комната 1', 'Кухня']);
  });

  it('memoizes results for unchanged walls', () => {
    const s = state();
    expect(selectRooms(s)).toBe(selectRooms(s));
    expect(selectWallLayout(s)).toBe(selectWallLayout({ ...s }));
  });
});
