import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork } from 'redux-saga/effects';
import { ApiRequestError } from '@/app/api/client';
import { CreateProjectFeature } from '@/features/create-project';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { reducer as furnitureReducer, actions as furnitureActions } from '@/features/furniture/slice';
import { EnvironmentFeature } from '@/features/environment';
import { HistoryFeature } from '@/features/history';
import { SelectionFeature } from '@/features/selection';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import { ProjectSessionFeature } from './index';
import { writeBackup } from './lib/localBackup';
import { sceneBridgeStore } from '@/features/editor-3d/model/sceneBridge';

const api = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  updateProject: vi.fn(),
  patchProject: vi.fn(),
}));

vi.mock('@/app/api', () => ({ projectsApi: api }));
vi.mock('@/shared/lib/toast', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const serverProject = (roomData: unknown, updatedAt = '2026-01-01T00:00:00Z') => ({
  id: 'p1',
  name: 'Гостиная',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt,
  roomData,
  playerPosition: null,
  playerRotation: null,
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: {
      editor: editorReducer,
      furniture: furnitureReducer,
      ...EnvironmentFeature.reducer,
      ...HistoryFeature.reducer,
      ...SelectionFeature.reducer,
      ...CreateProjectFeature.reducer,
      ...ProjectSessionFeature.reducer,
    },
    middleware: (gdm) => gdm({ thunk: false, serializableCheck: false, immutableCheck: false }).concat(saga),
  });
  saga.run(function* root() {
    yield all([fork(ProjectSessionFeature.sagas.init), fork(HistoryFeature.sagas.init), fork(SelectionFeature.sagas.init)]);
  });
  return store;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('project session saga', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    api.fetchProject.mockReset();
    api.updateProject.mockReset();
    api.patchProject.mockReset();
    sceneBridgeStore.setState({ screenToFloor: null, capture: null, fps: 0 });
  });
  afterEach(() => vi.useRealTimers());

  it('opens a project, migrating v1 room data', async () => {
    api.fetchProject.mockResolvedValue(serverProject({ dimensions: { width: 5, height: 3, depth: 4 } }));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    expect(store.getState().projectSession.status).toBe('ready');
    expect(store.getState().editor.dimensions).toEqual({ width: 5, height: 3, depth: 4 });
    expect(store.getState().createProject.projects[0].name).toBe('Гостиная');
  });

  it('reports a readable error for missing projects', async () => {
    api.fetchProject.mockRejectedValue(new ApiRequestError(404, 'project not found'));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    expect(store.getState().projectSession.status).toBe('error');
    expect(store.getState().projectSession.error).toBe('Проект не найден или был удалён');
  });

  it('opens the local copy when the server is unreachable', async () => {
    writeBackup('p1', { roomData: createEmptyScene({ width: 7, height: 3, depth: 3 }), camera: null, savedAt: '2026-01-02T00:00:00Z', synced: true });
    api.fetchProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    expect(store.getState().projectSession.status).toBe('ready');
    expect(store.getState().projectSession.saveState).toBe('offline');
    expect(store.getState().editor.dimensions.width).toBe(7);
  });

  it('prefers newer unsynced local edits and syncs them to the server', async () => {
    writeBackup('p1', { roomData: createEmptyScene({ width: 6, height: 3, depth: 3 }), camera: null, savedAt: '2026-02-01T00:00:00Z', synced: false });
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), '2026-01-01T00:00:00Z'));
    api.updateProject.mockImplementation(async (id: string, payload: { name: string }) => ({ ...serverProject(null), id, name: payload.name }));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    await flush();
    expect(store.getState().editor.dimensions.width).toBe(6);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(store.getState().projectSession.saveState).toBe('saved');
  });

  it('autosaves after edits and skips unchanged saves', async () => {
    vi.useFakeTimers();
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
    api.updateProject.mockImplementation(async () => serverProject(null));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await vi.runAllTimersAsync();
    store.dispatch(
      furnitureActions.addFurniture({ id: 'f1', name: 'Стул', modelPath: 'primitive:stool', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    const payload = api.updateProject.mock.calls[0][1] as { roomData: { furniture: unknown[]; schemaVersion: number } };
    expect(payload.roomData.schemaVersion).toBe(3);
    expect(payload.roomData.furniture).toHaveLength(1);
    expect(store.getState().projectSession.saveState).toBe('saved');
  });

  it('retries network failures and then keeps a local copy', async () => {
    vi.useFakeTimers();
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
    api.updateProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await vi.runAllTimersAsync();
    store.dispatch(ProjectSessionFeature.actions.saveNowRequested());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.updateProject).toHaveBeenCalledTimes(3);
    expect(store.getState().projectSession.saveState).toBe('offline');
    expect(window.localStorage.getItem('vrhc:backup:p1')).not.toBeNull();
  });

  it('saves a thumbnail once the scene is shown if the project has none', async () => {
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
    api.patchProject.mockImplementation(async (_id: string, patch: { thumbnail: string }) => ({ ...serverProject(null), thumbnail: patch.thumbnail }));
    sceneBridgeStore.setState({ capture: () => 'data:image/jpeg;base64,QUJD' });
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    store.dispatch(ProjectSessionFeature.actions.thumbnailRequested());
    await flush();
    expect(api.patchProject).toHaveBeenCalledWith('p1', { thumbnail: 'data:image/jpeg;base64,QUJD' });
    expect(store.getState().createProject.projects[0].thumbnail).toBe('data:image/jpeg;base64,QUJD');

    store.dispatch(ProjectSessionFeature.actions.thumbnailRequested());
    await flush();
    expect(api.patchProject).toHaveBeenCalledTimes(1);
  });

  it('skips the thumbnail when the scene cannot be captured', async () => {
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    store.dispatch(ProjectSessionFeature.actions.thumbnailRequested());
    await flush();
    expect(api.patchProject).not.toHaveBeenCalled();
  });

  it('clears the scene on close', async () => {
    api.fetchProject.mockResolvedValue(serverProject({ dimensions: { width: 9, height: 3, depth: 4 } }));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    store.dispatch(ProjectSessionFeature.actions.closeRequested());
    await flush();
    expect(store.getState().projectSession.status).toBe('idle');
    expect(store.getState().editor.dimensions.width).toBe(4);
  });
});
