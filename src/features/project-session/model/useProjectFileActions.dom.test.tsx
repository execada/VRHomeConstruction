// @vitest-environment jsdom
/**
 * «Открыть из файла…» в открытом проекте: сцена из файла — правка. Её отправляет на сервер
 * автосохранение или закрытие проекта, а закрытие вкладки до этого оставляет локальную копию.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork } from 'redux-saga/effects';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectFeature } from '@/features/create-project';
import { reducer as buildingReducer } from '@/features/editor-3d/building/slice';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { EnvironmentFeature } from '@/features/environment';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import { HistoryFeature } from '@/features/history';
import { SelectionFeature } from '@/features/selection';
import { buildProjectFile } from '@/shared/lib/projectFile';
import { ProjectSessionFeature } from '../index';
import { readBackup } from '../lib/localBackup';
import { useProjectFileActions } from './useProjectFileActions';
import { useProjectSession } from './useProjectSession';

const api = vi.hoisted(() => ({ fetchProject: vi.fn(), updateProject: vi.fn(), patchProject: vi.fn() }));
const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/app/api', () => ({ projectsApi: api, layoutsApi: { createLayout: vi.fn() } }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Проект на сервере: пустая комната 4 × 4 м. */
const serverProject = () => ({
  id: 'p1',
  name: 'Гостиная',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  roomData: createEmptyScene(),
  playerPosition: null,
  playerRotation: null,
});

/** Сцена из файла: комната 6 × 5 м с табуретом. */
function importedScene(): SceneDocument {
  const doc = createEmptyScene({ width: 6, height: 3, depth: 5 });
  const stool: SceneDocument['floors'][number]['furniture'][number] = {
    id: 'f1',
    name: 'Табурет',
    modelPath: 'primitive:stool',
    position: [1, 0, 1],
    rotation: [0, 0, 0],
    scale: 1,
  };
  return { ...doc, floors: [{ ...doc.floors[0], furniture: [stool] }] };
}

/** Выбранный пользователем файл (у File в jsdom нет text()). */
const fileOf = (text: string) => ({ size: text.length, text: async () => text }) as unknown as File;
const projectFile = (doc: SceneDocument) => fileOf(JSON.stringify(buildProjectFile('Из файла', doc)));

type SavedFloor = { dimensions: { width: number }; furniture: unknown[] };
/** Первый этаж в n-м запросе сохранения. */
const savedFloor = (n: number) => (api.updateProject.mock.calls[n][1] as { roomData: { floors: SavedFloor[] } }).roomData.floors[0];

function createStore() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: {
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
  return store;
}

const unmounts: Array<() => void> = [];

/** Страница редактора в миниатюре: сессия проекта p1 и меню проекта. Возвращается, когда проект открыт. */
async function openEditor() {
  const store = createStore();
  let files!: ReturnType<typeof useProjectFileActions>;
  const Editor = () => {
    useProjectSession('p1');
    files = useProjectFileActions();
    return null;
  };
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <Provider store={store}>
        <Editor />
      </Provider>,
    ),
  );
  const close = () => act(() => root.unmount());
  unmounts.push(close);
  await act(() => vi.runAllTimersAsync());
  expect(store.getState().projectSession.status).toBe('ready');
  return { store, files: () => files, close };
}

describe('useProjectFileActions: импорт файла в открытый проект', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toast).forEach((fn) => fn.mockReset());
    api.fetchProject.mockResolvedValue(serverProject());
    api.updateProject.mockImplementation(async () => ({ ...serverProject(), roomData: null }));
  });

  afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount());
    vi.useRealTimers();
  });

  it('сразу «Есть изменения», затем автосохранение отправляет сцену из файла на сервер', async () => {
    const { store, files } = await openEditor();
    await act(() => files().importFile(projectFile(importedScene())));
    expect(store.getState().editor.dimensions.width).toBe(6);
    expect(toast.success).toHaveBeenCalledWith('Сцена загружена из файла');
    expect(store.getState().projectSession.saveState).toBe('dirty');

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(savedFloor(0).dimensions.width).toBe(6);
    expect(savedFloor(0).furniture).toHaveLength(1);
    expect(store.getState().projectSession.saveState).toBe('saved');
  });

  it('закрытие вкладки до автосохранения оставляет локальную копию сцены из файла', async () => {
    const { files } = await openEditor();
    await act(() => files().importFile(projectFile(importedScene())));
    window.dispatchEvent(new Event('beforeunload'));
    const backup = readBackup('p1');
    expect(backup?.synced).toBe(false);
    expect((backup?.roomData as { floors: SavedFloor[] }).floors[0].dimensions.width).toBe(6);
  });

  it('выход из редактора сразу после импорта сохраняет сцену из файла — один раз', async () => {
    const { store, files, close } = await openEditor();
    await act(() => files().importFile(projectFile(importedScene())));
    close();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(savedFloor(0).dimensions.width).toBe(6);
    expect(store.getState().projectSession.status).toBe('idle');
  });

  it('файл не проекта ничего не меняет и не сохраняет', async () => {
    const { store, files } = await openEditor();
    await act(() => files().importFile(fileOf('{"app":"other"}')));
    expect(toast.error).toHaveBeenCalledWith('Это не файл проекта VR Home');
    expect(store.getState().projectSession.saveState).toBe('saved');
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.updateProject).not.toHaveBeenCalled();
    expect(store.getState().editor.dimensions.width).toBe(4);
  });
});
