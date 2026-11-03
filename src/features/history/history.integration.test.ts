import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork } from 'redux-saga/effects';
import { reducer as editorReducer, actions as editorActions } from '@/features/editor-3d/slice';
import { reducer as furnitureReducer, actions as furnitureActions } from '@/features/furniture/slice';
import { EnvironmentFeature } from '@/features/environment';
import { SelectionFeature } from '@/features/selection';
import { sceneLoadActions } from '@/features/editor-3d/sceneActions';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import { uniformOuterWalls } from '@/features/editor-3d/constants';
import type { FurnitureItem } from '@/features/furniture/types';
import { HistoryFeature } from './index';
import { SAME_TARGET_WINDOW_MS } from './lib/coalesce';

const chair = (x: number): FurnitureItem => ({
  id: 'chair',
  name: 'Стул',
  modelPath: 'primitive:stool',
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
});

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: {
      editor: editorReducer,
      furniture: furnitureReducer,
      ...EnvironmentFeature.reducer,
      ...HistoryFeature.reducer,
      ...SelectionFeature.reducer,
    },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(function* root() {
    yield all([fork(HistoryFeature.sagas.init), fork(SelectionFeature.sagas.init)]);
  });
  sceneLoadActions(createEmptyScene()).forEach((a) => store.dispatch(a));
  return store;
}

describe('history saga', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('starts empty after a scene load', () => {
    const store = setup();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('records edits and undoes/redoes them', () => {
    const store = setup();
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    expect(store.getState().history.past).toHaveLength(1);

    store.dispatch(HistoryFeature.actions.undoRequested());
    expect(store.getState().furniture.items).toHaveLength(0);
    expect(store.getState().history.future).toHaveLength(1);

    store.dispatch(HistoryFeature.actions.redoRequested());
    expect(store.getState().furniture.items).toHaveLength(1);
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('coalesces a drag into a single history step', () => {
    const store = setup();
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    vi.advanceTimersByTime(SAME_TARGET_WINDOW_MS + 10);
    for (let i = 1; i <= 20; i += 1) {
      vi.advanceTimersByTime(16);
      store.dispatch(furnitureActions.updateFurniture(chair(i * 0.05)));
    }
    expect(store.getState().history.past).toHaveLength(2);

    store.dispatch(HistoryFeature.actions.undoRequested());
    expect(store.getState().furniture.items[0].position[0]).toBe(0);
  });

  it('ignores UI-only actions and size measurements', () => {
    const store = setup();
    store.dispatch(editorActions.setActiveTool('furniture'));
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    vi.advanceTimersByTime(1000);
    store.dispatch(
      furnitureActions.updateFurnitureSizes({ itemId: 'chair', sizes: { halfWidth: 0.2, halfDepth: 0.2, height: 0.45 } }),
    );
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('keeps measured sizes when undoing to an older snapshot', () => {
    const store = setup();
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    vi.advanceTimersByTime(1000);
    store.dispatch(
      furnitureActions.updateFurnitureSizes({ itemId: 'chair', sizes: { halfWidth: 0.2, halfDepth: 0.2, height: 0.45 } }),
    );
    store.dispatch(furnitureActions.updateFurniture({ ...store.getState().furniture.items[0], position: [1, 0, 0] }));
    store.dispatch(HistoryFeature.actions.undoRequested());
    expect(store.getState().furniture.items[0].halfWidth).toBe(0.2);
  });

  it('drops the redo stack after a new edit', () => {
    const store = setup();
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    store.dispatch(HistoryFeature.actions.undoRequested());
    vi.advanceTimersByTime(1000);
    store.dispatch(editorActions.setOuterWalls(uniformOuterWalls(0.3)));
    expect(store.getState().history.future).toHaveLength(0);
  });

  it('clears selection when the selected item disappears on undo', () => {
    const store = setup();
    store.dispatch(furnitureActions.addFurniture(chair(0)));
    store.dispatch(SelectionFeature.actions.select({ kind: 'furniture', id: 'chair' }));
    store.dispatch(HistoryFeature.actions.undoRequested());
    expect(store.getState().selection.current).toBeNull();
  });
});
