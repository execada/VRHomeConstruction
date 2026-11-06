import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { actions as furnitureActions, reducer as furnitureReducer } from '@/features/furniture/slice';
import { createEmptyFloor, sceneOf } from '../lib/scene/build';
import { sceneLoadActions } from '../sceneActions';
import { reducer as editorReducer } from '../slice';
import { buildingSelectors as s } from './selectors';
import { reducer as buildingReducer } from './slice';

function setup() {
  const store = configureStore({ reducer: { editor: editorReducer, building: buildingReducer, furniture: furnitureReducer }, middleware: (gdm) => gdm({ thunk: false }) });
  const lower = { ...createEmptyFloor({ width: 10, height: 3, depth: 8 }), stairs: [{ id: 's', kind: 'straight' as const, position: [-3, 0] as [number, number], rotation: 0, width: 1 }] };
  const upper = createEmptyFloor({ width: 10, height: 2.8, depth: 6 }, { id: 'floor-2', name: '2 этаж', offset: [0, -1] });
  sceneLoadActions(sceneOf([lower, upper], undefined, 0.3), 'floor-2').forEach((a) => store.dispatch(a));
  return store;
}

describe('селекторы здания', () => {
  it('этажи снизу вверх: положение, активный этаж и этаж под ним', () => {
    const state = setup().getState();
    expect(s.selectFloorFrames(state).map((f) => f.base)).toEqual([0, 3.3]);
    expect(s.selectActiveIndex(state)).toBe(1);
    expect(s.selectActiveFrame(state).offset).toEqual([0, -1]);
    expect(s.selectFloorBelow(state)?.meta.id).toBe('floor-1');
    expect(s.selectBuildingHeight(state)).toBeCloseTo(3.3 + 2.8 + 0.25);
    expect(s.selectActiveRise(state)).toBeCloseTo(3.1);
  });

  it('вырез над лестницей снизу — в координатах активного этажа и только внутри комнаты', () => {
    const [cut] = s.selectCutoutsFromBelow(setup().getState());
    expect(cut.minX).toBeCloseTo(-3.5);
    expect(cut.maxZ).toBeLessThanOrEqual(3);
    expect(cut.minZ).toBeGreaterThanOrEqual(-3);
  });

  it('правка мебели не пересчитывает положение этажей, этаж ниже и габариты', () => {
    const store = setup();
    const before = store.getState();
    store.dispatch(furnitureActions.addFurniture({ id: 'f', name: 'Табурет', modelPath: 'primitive:stool', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }));
    const after = store.getState();
    expect(s.selectFloorFrames(after)).toBe(s.selectFloorFrames(before));
    expect(s.selectFloorBelow(after)).toBe(s.selectFloorBelow(before));
    expect(s.selectFloors(after)).not.toBe(s.selectFloors(before));
    expect(s.selectFloors(after)[1].content.furniture).toHaveLength(1);
  });

  it('мир для хождения: на марше — ступени, наверху — пол второго этажа', () => {
    const world = s.selectWalkWorld(setup().getState());
    expect(world.surfaces.some((x) => x.kind === 'stair')).toBe(true);
    expect(world.obstacles.length).toBeGreaterThan(0);
    const lot = s.selectBuildingLot(setup().getState());
    expect(lot.maxX).toBeCloseTo(11);
  });
});
