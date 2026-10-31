// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectFeature } from '@/features/create-project';
import type { Project } from '@/features/create-project/types';
import { FoldersFeature, foldersActions } from '@/features/folders';
import { NotificationsFeature } from '@/features/notifications';
import { UserFeature } from '@/features/user';
import { useProjectActions } from './model/useProjectActions';

const api = vi.hoisted(() => ({
  projects: { createProject: vi.fn(), patchProject: vi.fn(), deleteProject: vi.fn(), duplicateProject: vi.fn() },
  layouts: { fetchLayout: vi.fn() },
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/app/api', () => ({ projectsApi: api.projects, layoutsApi: api.layouts }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = (id: string, extra: Partial<Project> = {}): Project => ({ id, name: `Проект ${id}`, status: 'active', createdAt: '2026-01-01', ...extra });

function setup(isAuth = true) {
  const store = configureStore({
    reducer: { ...CreateProjectFeature.reducer, ...FoldersFeature.reducer, ...NotificationsFeature.reducer, ...UserFeature.reducer },
  });
  if (isAuth) store.dispatch(UserFeature.actions.setUser({ id: 'u1', name: 'Тест', email: 't@example.com' }));
  let actions!: ReturnType<typeof useProjectActions>;
  const Probe = () => {
    actions = useProjectActions();
    return null;
  };
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], { initialEntries: ['/'] });
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    ),
  );
  return { store, router, actions: () => actions };
}

describe('useProjectActions', () => {
  beforeEach(() => {
    Object.values(api.projects).forEach((fn) => fn.mockReset());
    api.layouts.fetchLayout.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('без входа предлагает войти и не создаёт проект', async () => {
    const { store, actions } = setup(false);
    await act(() => actions().createBlank());
    expect(api.projects.createProject).not.toHaveBeenCalled();
    expect(store.getState().user.isAuthModalOpen).toBe(true);
  });

  it('создаёт пустой проект и открывает редактор', async () => {
    api.projects.createProject.mockResolvedValue(project('p1', { name: 'Проект 1' }));
    const { store, router, actions } = setup();
    await act(() => actions().createBlank());
    const input = api.projects.createProject.mock.calls[0][0] as { name: string; roomData: { schemaVersion: number } };
    expect(input.name).toBe('Проект 1');
    expect(input.roomData.schemaVersion).toBe(2);
    expect(store.getState().createProject.projects.map((p) => p.id)).toEqual(['p1']);
    expect(router.state.location.pathname).toBe('/project/p1');
  });

  it('создаёт проект из встроенного шаблона с его названием', async () => {
    api.projects.createProject.mockResolvedValue(project('p2'));
    const { actions } = setup();
    await act(() => actions().createFromBuiltin('kitchen'));
    expect(api.projects.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Кухня-столовая', template: 'kitchen' }));
    await act(() => actions().createFromBuiltin('nope'));
    expect(toast.error).toHaveBeenCalledWith('Шаблон не найден');
  });

  it('повреждённый пользовательский шаблон не подменяется пустой комнатой', async () => {
    api.layouts.fetchLayout.mockResolvedValue({ id: 'l1', name: 'Мой', roomData: { schemaVersion: 99 } });
    const { actions } = setup();
    await act(() => actions().createFromLayout('l1'));
    expect(api.projects.createProject).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Шаблон «Мой» повреждён'));
  });

  it('избранное меняется сразу и откатывается при ошибке сервера', async () => {
    const { store, actions } = setup();
    const p = project('p1');
    store.dispatch(CreateProjectFeature.actions.setProjects([p]));
    let reject!: (e: Error) => void;
    api.projects.patchProject.mockReturnValue(new Promise((_, r) => (reject = r)));
    let pending!: Promise<void>;
    act(() => {
      pending = actions().toggleFavorite(p);
    });
    expect(store.getState().createProject.projects[0].favorite).toBe(true);
    await act(async () => {
      reject(new Error('offline'));
      await pending;
    });
    expect(store.getState().createProject.projects[0].favorite).toBeFalsy();
    expect(toast.error).toHaveBeenCalled();
  });

  it('удаление убирает проект из списка и папок и пишет уведомление', async () => {
    api.projects.deleteProject.mockResolvedValue(undefined);
    const { store, actions } = setup();
    const p = project('p1');
    store.dispatch(CreateProjectFeature.actions.setProjects([p]));
    store.dispatch(
      foldersActions.addFolder({ id: 'f1', name: 'Папка', createdAt: '', projectIds: ['p1'], layoutIds: [], childFolderIds: [], parentId: null }),
    );
    await act(() => actions().remove(p));
    expect(store.getState().createProject.projects).toEqual([]);
    expect(store.getState().folders.folders[0].projectIds).toEqual([]);
    expect(store.getState().notifications.items[0].title).toBe('Проект удалён');
  });

  it('ошибка удаления не трогает список', async () => {
    api.projects.deleteProject.mockRejectedValue(new Error('500'));
    const { store, actions } = setup();
    store.dispatch(CreateProjectFeature.actions.setProjects([project('p1')]));
    await act(() => actions().remove(project('p1')));
    expect(store.getState().createProject.projects).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith('Не удалось удалить проект');
  });

  it('импорт отклоняет файл не из приложения', async () => {
    const { actions } = setup();
    const file = { size: 10, text: async () => '{"app":"other"}' } as unknown as File;
    await act(() => actions().importFile(file));
    expect(api.projects.createProject).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('не файл проекта'));
  });
});
