import { describe, expect, it } from 'vitest';
import { createEmptyFloor, sceneOf } from '@/features/editor-3d/lib/scene/build';
import { floorToShow } from './floorFocus';

const building = () => sceneOf([createEmptyFloor(), createEmptyFloor(undefined, { id: 'floor-2', name: '2 этаж' })]);

describe('этаж после отмены и повтора', () => {
  it('правка была на другом этаже — показываем его', () => {
    const current = building();
    const target = { ...current, floors: [{ ...current.floors[0], rooms: [{ id: 'r', name: 'Кухня', anchor: [0, 0] as [number, number] }] }, current.floors[1]] };
    expect(floorToShow(target, current, 'floor-2')).toBe('floor-1');
  });

  it('правка на активном этаже или на нескольких — активный этаж не меняется', () => {
    const current = building();
    const onActive = { ...current, floors: [current.floors[0], { ...current.floors[1], name: 'Мансарда' }] };
    expect(floorToShow(onActive, current, 'floor-2')).toBe('floor-2');
    const both = { ...current, floors: current.floors.map((f) => ({ ...f, name: `${f.name}!` })) };
    expect(floorToShow(both, current, 'floor-2')).toBe('floor-2');
    expect(floorToShow(current, current, 'floor-1')).toBe('floor-1');
  });

  it('активного этажа в снимке нет (отмена добавления этажа) — решает загрузка', () => {
    const current = building();
    const target = { ...current, floors: [current.floors[0]] };
    expect(floorToShow(target, current, 'floor-2')).toBe('floor-2');
  });
});
