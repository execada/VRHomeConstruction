import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork } from 'redux-saga/effects';
import { ApiRequestError } from '@/app/api/client';
import { CreateProjectFeature } from '@/features/create-project';
import { reducer as buildingReducer } from '@/features/editor-3d/building/slice';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { reducer as furnitureReducer, actions as furnitureActions } from '@/features/furniture/slice';
import { EnvironmentFeature } from '@/features/environment';
import { HistoryFeature } from '@/features/history';
import { SelectionFeature } from '@/features/selection';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import type { FurnitureItem } from '@/features/furniture/types';
import { actions as userActions, name as userSliceName, reducer as userReducer } from '@/features/user/slice';
import { ProjectSessionFeature } from './index';
import { readBackup, removeBackup, writeBackup, type LocalBackup } from './lib/localBackup';
import { sceneBridgeStore } from '@/features/editor-3d/model/sceneBridge';

const api = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  updateProject: vi.fn(),
  patchProject: vi.fn(),
}));

vi.mock('@/app/api', () => ({ projectsApi: api }));
const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

const serverProject = (roomData: unknown, updatedAt = '2026-01-01T00:00:00Z', id = 'p1') => ({
  id,
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

const anna = { id: 'u1', name: 'Анна', email: 'anna@example.com' };
const boris = { id: 'u2', name: 'Борис', email: 'boris@example.com' };

/** Локальная копия проекта p1 (по умолчанию — несинхронизированная, владелец — Анна). */
const backupOf = (roomData: unknown, extra: Partial<LocalBackup> = {}): LocalBackup => ({
  roomData,
  camera: null,
  savedAt: '2026-02-01T00:00:00Z',
  synced: false,
  userId: anna.id,
  ...extra,
});

/** Хранилище с сагами; пользователь по умолчанию уже вошёл (`null` — гость). */
function setup(user: typeof anna | null = anna) {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: {
      [userSliceName]: userReducer,
      editor: editorReducer,
      building: buildingReducer,
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
  if (user) store.dispatch(userActions.setUser(user));
  return store;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Задержки саги: автосохранение после правки и запись локальной копии. */
const AUTOSAVE_MS = 1500;
const BACKUP_MS = 400;

const item = (id: string): FurnitureItem => ({ id, name: id, modelPath: 'primitive:stool', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });

type SavedBody = { roomData: { floors: Array<{ furniture: FurnitureItem[] }> } };

/** Документ сцены из n-го запроса сохранения. */
const savedRoomData = (n: number) => (api.updateProject.mock.calls[n][1] as SavedBody).roomData;

/** id мебели из n-го запроса сохранения. */
const savedFurniture = (n: number) => savedRoomData(n).floors[0].furniture.map((f) => f.id);

/** Следующий запрос сохранения отвечает, только когда тест вызовет возвращённую функцию. */
function holdNextSave(): () => void {
  let respond = () => {};
  api.updateProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = () => resolve(serverProject(null));
      }),
  );
  return () => respond();
}

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
    writeBackup('p1', backupOf(createEmptyScene({ width: 7, height: 3, depth: 3 }), { savedAt: '2026-01-02T00:00:00Z', synced: true }));
    api.fetchProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    expect(store.getState().projectSession.status).toBe('ready');
    expect(store.getState().projectSession.saveState).toBe('offline');
    expect(store.getState().editor.dimensions.width).toBe(7);
  });

  it('prefers newer unsynced local edits and syncs them to the server', async () => {
    writeBackup('p1', backupOf(createEmptyScene({ width: 6, height: 3, depth: 3 })));
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
    const payload = api.updateProject.mock.calls[0][1] as { roomData: { floors: Array<{ furniture: unknown[] }>; schemaVersion: number } };
    expect(payload.roomData.schemaVersion).toBe(4);
    expect(payload.roomData.floors[0].furniture).toHaveLength(1);
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

  describe('edits made while a save is in flight', () => {
    /** Открыть проект и поставить диван; запрос его автосохранения ждёт ответа сервера. */
    async function startSlowSave() {
      vi.useFakeTimers();
      api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
      api.updateProject.mockImplementation(async () => serverProject(null));
      const respond = holdNextSave();
      const store = setup();
      store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
      await vi.runAllTimersAsync();
      store.dispatch(furnitureActions.addFurniture(item('sofa')));
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
      expect(api.updateProject).toHaveBeenCalledTimes(1);
      expect(store.getState().projectSession.saveState).toBe('saving');
      return { store, respond };
    }

    /** Поставить подушку, пока идёт запрос, и дождаться записи локальной копии. */
    async function addPillowDuringSave(store: ReturnType<typeof setup>) {
      store.dispatch(furnitureActions.addFurniture(item('pillow')));
      await vi.advanceTimersByTimeAsync(BACKUP_MS + 100);
    }

    it('stays unsaved after the request and sends the edit with the next autosave', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(store.getState().projectSession.saveState).toBe('dirty');
      expect(readBackup('p1')?.synced).toBe(false);

      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      expect(store.getState().projectSession.saveState).toBe('saved');
      expect(readBackup('p1')?.synced).toBe(true);
    });

    it('restores the edit after a reload right after the request', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      respond();
      await vi.advanceTimersByTimeAsync(10);

      // Перезагрузка: сервер отдаёт то, что успел получить (только диван)
      api.fetchProject.mockResolvedValue(serverProject(savedRoomData(0)));
      const reloaded = setup();
      reloaded.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
      await vi.advanceTimersByTimeAsync(10);
      expect(reloaded.getState().furniture.items.map((i) => i.id)).toEqual(['sofa', 'pillow']);
      // Восстановленная копия сразу уходит на сервер
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      expect(reloaded.getState().projectSession.saveState).toBe('saved');
    });

    it('sends the edit when the project is closed right after the request', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      respond();
      await vi.advanceTimersByTimeAsync(10);
      store.dispatch(ProjectSessionFeature.actions.closeRequested());
      await vi.advanceTimersByTimeAsync(10);
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      expect(store.getState().projectSession.status).toBe('idle');
    });

    it('starts the next save only after the request in flight is answered', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
      expect(api.updateProject).toHaveBeenCalledTimes(1);

      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      expect(store.getState().projectSession.saveState).toBe('saved');
    });

    it('marks the local copy synced when the edit made during the request is undone', async () => {
      const { store, respond } = await startSlowSave();
      store.dispatch(furnitureActions.addFurniture(item('pillow')));
      store.dispatch(HistoryFeature.actions.undoRequested());
      await vi.advanceTimersByTimeAsync(BACKUP_MS + 100);
      expect(store.getState().furniture.items.map((i) => i.id)).toEqual(['sofa']);
      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(store.getState().projectSession.saveState).toBe('dirty');

      // Сцена снова как на сервере: следующее автосохранение без запроса, копия синхронизирована
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(api.updateProject).toHaveBeenCalledTimes(1);
      expect(store.getState().projectSession.saveState).toBe('saved');
      expect(readBackup('p1')?.synced).toBe(true);
    });

    it('sends the closed project edit even if another project opens before the request is answered', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      store.dispatch(ProjectSessionFeature.actions.closeRequested());
      api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), undefined, 'p2'));
      store.dispatch(ProjectSessionFeature.actions.openRequested('p2'));
      await vi.advanceTimersByTimeAsync(10);
      expect(store.getState().projectSession).toMatchObject({ projectId: 'p2', status: 'ready', saveState: 'saved' });

      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(api.updateProject.mock.calls[1][0]).toBe('p1');
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      // Ответы для первого проекта не трогают открытый: ни статус, ни сцену
      expect(store.getState().projectSession).toMatchObject({ projectId: 'p2', status: 'ready', saveState: 'saved' });
      expect(store.getState().furniture.items).toEqual([]);
    });

    it('queues a repeated save-now behind the request in flight instead of cancelling it', async () => {
      vi.useFakeTimers();
      api.fetchProject.mockResolvedValue(serverProject(createEmptyScene()));
      api.updateProject.mockImplementation(async () => serverProject(null));
      const respond = holdNextSave();
      const store = setup();
      store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
      await vi.runAllTimersAsync();
      store.dispatch(ProjectSessionFeature.actions.saveNowRequested());
      await vi.advanceTimersByTimeAsync(10);
      store.dispatch(ProjectSessionFeature.actions.saveNowRequested());
      await vi.advanceTimersByTimeAsync(10);
      expect(api.updateProject).toHaveBeenCalledTimes(1);

      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(api.updateProject).toHaveBeenCalledTimes(2);
      expect(store.getState().projectSession.saveState).toBe('saved');
    });

    it('keeps the scene of the same project reopened while closing waited for the request', async () => {
      const { store, respond } = await startSlowSave();
      await addPillowDuringSave(store);
      store.dispatch(ProjectSessionFeature.actions.closeRequested());
      // Тот же проект открыт снова, пока закрытие ждёт ответа: правки берутся из локальной копии
      store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
      await vi.advanceTimersByTimeAsync(10);
      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(savedFurniture(1)).toEqual(['sofa', 'pillow']);
      expect(store.getState().projectSession).toMatchObject({ projectId: 'p1', status: 'ready', saveState: 'saved' });
      expect(store.getState().furniture.items.map((i) => i.id)).toEqual(['sofa', 'pillow']);
    });

    it('stays saved when only measured model sizes arrive during the request', async () => {
      const { store, respond } = await startSlowSave();
      store.dispatch(furnitureActions.updateFurnitureSizes({ itemId: 'sofa', sizes: { halfWidth: 1, halfDepth: 0.5, height: 0.9 } }));
      respond();
      await vi.advanceTimersByTimeAsync(10);
      expect(store.getState().projectSession.saveState).toBe('saved');
      expect(readBackup('p1')?.synced).toBe(true);

      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
      expect(api.updateProject).toHaveBeenCalledTimes(1);
    });
  });
});

describe('выход из аккаунта на странице проекта', () => {
  const user = anna;
  const stool = { id: 'f1', name: 'Стул', modelPath: 'primitive:stool', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 };
  const backupFurniture = () => (readBackup('p1')?.roomData as { floors: Array<{ furniture: unknown[] }> } | undefined)?.floors[0].furniture;

  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    api.fetchProject.mockReset();
    api.updateProject.mockReset();
    api.patchProject.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
    sceneBridgeStore.setState({ screenToFloor: null, capture: null, fps: 0 });
    vi.useFakeTimers();
  });
  afterEach(() => {
    removeBackup('p1');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function openedProject() {
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), '2026-01-01T00:00:00Z'));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await vi.runAllTimersAsync();
    expect(store.getState().projectSession.status).toBe('ready');
    return store;
  }

  it('несохранённая правка остаётся локальной копией, сцена закрывается, страница просит войти', async () => {
    const store = await openedProject();
    store.dispatch(furnitureActions.addFurniture(stool));

    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(5000);

    expect(readBackup('p1')?.synced).toBe(false);
    expect(backupFurniture()).toHaveLength(1);
    expect(store.getState().furniture.items).toHaveLength(0);
    expect(store.getState().projectSession).toMatchObject({ projectId: 'p1', status: 'signedOut', unsavedKept: true });
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('после входа проект открывается снова с несохранённой правкой и досохраняется', async () => {
    const store = await openedProject();
    store.dispatch(furnitureActions.addFurniture(stool));
    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(100);
    api.updateProject.mockImplementation(async () => serverProject(null, new Date().toISOString()));

    store.dispatch(userActions.setUser(user));
    await vi.advanceTimersByTimeAsync(100);

    expect(api.fetchProject).toHaveBeenCalledTimes(2);
    expect(store.getState().projectSession.status).toBe('ready');
    expect(store.getState().furniture.items).toHaveLength(1);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(store.getState().projectSession.saveState).toBe('saved');
    expect(readBackup('p1')?.synced).toBe(true);
  });

  it('localStorage переполнен: правка доживает до входа в памяти вкладки', async () => {
    const store = await openedProject();
    const storage = window.localStorage;
    vi.stubGlobal('window', { localStorage: { ...storage, getItem: storage.getItem, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.dispatch(furnitureActions.addFurniture(stool));

    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', unsavedKept: true });

    api.updateProject.mockImplementation(async () => serverProject(null, new Date().toISOString()));
    store.dispatch(userActions.setUser(user));
    await vi.advanceTimersByTimeAsync(100);

    expect(store.getState().furniture.items).toHaveLength(1);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(store.getState().projectSession.saveState).toBe('saved');
  });

  it('без несохранённых правок копия не пишется', async () => {
    const store = await openedProject();

    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(100);

    expect(readBackup('p1')).toBeNull();
    expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', unsavedKept: false });
  });

  it('вход на другой странице (проект не открыт) ничего не открывает', async () => {
    const store = setup();

    store.dispatch(userActions.logout());
    store.dispatch(userActions.setUser(user));
    await vi.advanceTimersByTimeAsync(100);

    expect(api.fetchProject).not.toHaveBeenCalled();
    expect(store.getState().projectSession.status).toBe('idle');
  });

  it('проект без входа (401) просит войти и помнит о локальной копии', async () => {
    writeBackup('p1', backupOf(createEmptyScene()));
    api.fetchProject.mockRejectedValue(new ApiRequestError(401, 'authorization required'));
    const store = setup();

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await vi.advanceTimersByTimeAsync(100);

    expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', unsavedKept: true, error: null });
  });

  it('выход во время открытия: сцена не загружается', async () => {
    let answer: (project: unknown) => void = () => {};
    api.fetchProject.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const store = setup();
    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await vi.advanceTimersByTimeAsync(10);

    store.dispatch(userActions.logout());
    answer(serverProject(createEmptyScene({ width: 9, height: 3, depth: 4 })));
    await vi.advanceTimersByTimeAsync(100);

    expect(store.getState().projectSession.status).toBe('signedOut');
    expect(store.getState().editor.dimensions.width).toBe(4);
    expect(store.getState().createProject.projects).toHaveLength(0);
  });

  it('автосохранение, отклонённое из-за конца сессии, не показывает своей ошибки', async () => {
    const store = await openedProject();
    api.updateProject.mockRejectedValue(new ApiRequestError(401, 'invalid or expired token', true));

    store.dispatch(furnitureActions.addFurniture(stool));
    await vi.advanceTimersByTimeAsync(2000);

    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(store.getState().projectSession.saveState).not.toBe('error');
  });

  it('выход во время паузы перед повтором сохранения: повтора и сообщения об ошибке нет', async () => {
    const store = await openedProject();
    api.updateProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    store.dispatch(furnitureActions.addFurniture(stool));
    await vi.advanceTimersByTimeAsync(1600);
    expect(api.updateProject).toHaveBeenCalledTimes(1);

    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(readBackup('p1')?.synced).toBe(false);
  });

  it('ответ на сохранение после выхода не отмечает копию синхронизированной', async () => {
    const store = await openedProject();
    let answer: (project: unknown) => void = () => {};
    api.updateProject.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    store.dispatch(furnitureActions.addFurniture(stool));
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.updateProject).toHaveBeenCalledTimes(1);

    store.dispatch(furnitureActions.addFurniture({ ...stool, id: 'f2' }));
    store.dispatch(userActions.logout());
    answer(serverProject(null, new Date().toISOString()));
    await vi.advanceTimersByTimeAsync(100);

    expect(readBackup('p1')?.synced).toBe(false);
    expect(backupFurniture()).toHaveLength(2);
    expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', saveState: 'saved', lastSavedAt: null });
  });

  it('уход со страницы после выхода закрывает сессию без сохранения', async () => {
    const store = await openedProject();
    store.dispatch(furnitureActions.addFurniture(stool));
    store.dispatch(userActions.logout());
    await vi.advanceTimersByTimeAsync(100);

    store.dispatch(ProjectSessionFeature.actions.closeRequested());
    await vi.advanceTimersByTimeAsync(100);

    expect(store.getState().projectSession.status).toBe('idle');
    expect(api.updateProject).not.toHaveBeenCalled();
    expect(readBackup('p1')?.synced).toBe(false);
  });
});

describe('локальная копия принадлежит пользователю', () => {
  const smallRoom = () => createEmptyScene({ width: 6, height: 3, depth: 3 });

  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    api.fetchProject.mockReset();
    api.updateProject.mockReset();
    api.patchProject.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
    sceneBridgeStore.setState({ screenToFloor: null, capture: null, fps: 0 });
  });
  afterEach(() => {
    removeBackup('p1');
    vi.useRealTimers();
  });

  it('своя копия восстанавливается и досохраняется', async () => {
    writeBackup('p1', backupOf(smallRoom()));
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), '2026-01-01T00:00:00Z'));
    api.updateProject.mockImplementation(async () => serverProject(null, new Date().toISOString()));
    const store = setup(anna);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    await flush();

    expect(store.getState().editor.dimensions.width).toBe(6);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(readBackup('p1')).toMatchObject({ synced: true, userId: 'u1' });
  });

  it('копия другого аккаунта при связи не открывается: берётся версия сервера, копия остаётся на месте', async () => {
    writeBackup('p1', backupOf(smallRoom()));
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene({ width: 9, height: 3, depth: 3 }), '2026-01-01T00:00:00Z'));
    const store = setup(boris);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    await flush();

    expect(store.getState().projectSession).toMatchObject({ status: 'ready', fromLocalBackup: false });
    expect(store.getState().editor.dimensions.width).toBe(9);
    expect(api.updateProject).not.toHaveBeenCalled();
    expect(readBackup('p1')).toMatchObject({ synced: false, userId: 'u1' });
  });

  it('копия старого формата (без владельца) при связи по-прежнему подхватывается', async () => {
    writeBackup('p1', backupOf(smallRoom(), { userId: undefined }));
    api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), '2026-01-01T00:00:00Z'));
    api.updateProject.mockImplementation(async () => serverProject(null, new Date().toISOString()));
    const store = setup(anna);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();
    await flush();

    expect(store.getState().editor.dimensions.width).toBe(6);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['чужой аккаунт', boris, backupOf(createEmptyScene())],
    ['гость', null, backupOf(createEmptyScene())],
    ['копия старого формата', anna, backupOf(createEmptyScene(), { userId: undefined })],
  ])('без связи: %s копию не видит — ошибка открытия', async (_name, user, backup) => {
    writeBackup('p1', backup);
    api.fetchProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = setup(user);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();

    expect(store.getState().projectSession.status).toBe('error');
    expect(store.getState().editor.dimensions.width).toBe(4);
  });

  it('без связи своя копия открывается', async () => {
    writeBackup('p1', backupOf(smallRoom()));
    api.fetchProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
    const store = setup(anna);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();

    expect(store.getState().projectSession).toMatchObject({ status: 'ready', saveState: 'offline' });
    expect(store.getState().editor.dimensions.width).toBe(6);
  });

  it('401 при открытии: строка о несохранённых правках — только если копия принадлежит запомнившемуся пользователю', async () => {
    writeBackup('p1', backupOf(smallRoom(), { userId: 'u2' }));
    api.fetchProject.mockRejectedValue(new ApiRequestError(401, 'authorization required'));
    const store = setup(anna);

    store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
    await flush();

    expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', unsavedKept: false });
  });

  describe('правки записываются с id пользователя', () => {
    const stool = { id: 'f1', name: 'Стул', modelPath: 'primitive:stool', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 };

    beforeEach(() => vi.useFakeTimers());

    async function openedProject() {
      api.fetchProject.mockResolvedValue(serverProject(createEmptyScene(), '2026-01-01T00:00:00Z'));
      const store = setup(anna);
      store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
      await vi.runAllTimersAsync();
      return store;
    }

    it('локальная копия и копия при сохранении', async () => {
      const store = await openedProject();
      api.updateProject.mockRejectedValue(new ApiRequestError(0, 'offline'));

      store.dispatch(furnitureActions.addFurniture(stool));
      await vi.advanceTimersByTimeAsync(500);
      expect(readBackup('p1')).toMatchObject({ synced: false, userId: 'u1' });

      removeBackup('p1');
      await vi.advanceTimersByTimeAsync(2000);
      expect(readBackup('p1')).toMatchObject({ synced: false, userId: 'u1' });
    });

    it('при выходе пользователь уже стёрт — копия пишется с запомненным id, а чужому она не видна', async () => {
      const store = await openedProject();
      store.dispatch(furnitureActions.addFurniture(stool));

      store.dispatch(userActions.logout());
      await vi.advanceTimersByTimeAsync(100);

      expect(readBackup('p1')).toMatchObject({ synced: false, userId: 'u1' });
      expect(store.getState().projectSession).toMatchObject({ status: 'signedOut', unsavedKept: true });

      api.fetchProject.mockRejectedValue(new ApiRequestError(0, 'offline'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      store.dispatch(userActions.setUser(boris));
      await vi.advanceTimersByTimeAsync(100);

      expect(store.getState().projectSession.status).toBe('error');
      expect(readBackup('p1')?.userId, 'копию Анны вход Бориса не стирает').toBe('u1');
    });
  });
});
