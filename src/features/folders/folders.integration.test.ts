import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { ApiRequestError } from '@/app/api/client';
import { FoldersFeature } from './index';
import type { Folder } from './types';

const api = vi.hoisted(() => ({ updateFolder: vi.fn(), deleteFolder: vi.fn(), fetchFolders: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/app/api', () => ({ foldersApi: api }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

const { actions, selectors } = FoldersFeature;
const flush = () => new Promise((r) => setTimeout(r, 0));

const folder = (id: string, extra: Partial<Folder> = {}): Folder => ({
  id,
  name: `Папка ${id}`,
  createdAt: '2026-01-01T00:00:00Z',
  projectIds: [],
  layoutIds: [],
  childFolderIds: [],
  parentId: null,
  ...extra,
});

function setup(initial: Folder[]) {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...FoldersFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(FoldersFeature.sagas.init);
  initial.forEach((f) => store.dispatch(actions.addFolder(f)));
  return store;
}

describe('сохранение папок', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toast).forEach((fn) => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('отправляет переименованную папку целиком', async () => {
    api.updateFolder.mockResolvedValue(undefined);
    const store = setup([folder('a', { projectIds: ['p1'] })]);

    store.dispatch(actions.renameFolder({ folderId: 'a', name: 'Кухни' }));
    await flush();

    expect(api.updateFolder).toHaveBeenCalledWith('a', expect.objectContaining({ name: 'Кухни', projectIds: ['p1'] }));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('конец сессии: без своего сообщения и без повторной загрузки (выход очистит папки)', async () => {
    api.updateFolder.mockRejectedValue(new ApiRequestError(401, 'invalid or expired token', true));
    const store = setup([folder('a')]);

    store.dispatch(actions.renameFolder({ folderId: 'a', name: 'Кухни' }));
    await flush();

    expect(toast.error).not.toHaveBeenCalled();
    expect(api.fetchFolders).not.toHaveBeenCalled();
  });

  it('при отказе сервера показывает причину и возвращает сохранённое состояние', async () => {
    api.updateFolder.mockRejectedValue(new ApiRequestError(400, 'folder cannot be moved into its own subfolder'));
    api.fetchFolders.mockResolvedValue([folder('a')]);
    const store = setup([folder('a')]);

    store.dispatch(actions.renameFolder({ folderId: 'a', name: 'Новое имя' }));
    await flush();

    expect(toast.error).toHaveBeenCalledWith('Нельзя переместить папку в её же подпапку');
    expect(selectors.selectFolders(store.getState())[0].name).toBe('Папка a');
  });

  it('неудачное удаление возвращает папку в список', async () => {
    api.deleteFolder.mockRejectedValue(new ApiRequestError(500, 'internal server error'));
    api.fetchFolders.mockResolvedValue([folder('a'), folder('b')]);
    const store = setup([folder('a'), folder('b')]);

    store.dispatch(actions.removeFolder('b'));
    expect(selectors.selectFolders(store.getState()).map((f) => f.id)).toEqual(['a']);
    await flush();

    expect(toast.error).toHaveBeenCalledWith('Сервер временно недоступен, попробуйте позже');
    expect(selectors.selectFolders(store.getState()).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('если перечитать не удалось, оставляет текущее состояние', async () => {
    api.deleteFolder.mockRejectedValue(new ApiRequestError(0, 'Нет связи с сервером'));
    api.fetchFolders.mockRejectedValue(new ApiRequestError(0, 'Нет связи с сервером'));
    const store = setup([folder('a')]);

    store.dispatch(actions.removeFolder('a'));
    await flush();

    expect(toast.error).toHaveBeenCalledWith('Нет связи с сервером');
    expect(selectors.selectFolders(store.getState())).toEqual([]);
  });
});
