import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { CreateProjectFeature } from './index';
import type { Project } from './types';

const api = vi.hoisted(() => ({ fetchProjects: vi.fn(), deleteProject: vi.fn(), createProject: vi.fn() }));
vi.mock('@/app/api', () => ({ projectsApi: api }));

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id,
  name: `Проект ${id}`,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...CreateProjectFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(CreateProjectFeature.sagas.init);
  return store;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const { actions, selectors } = CreateProjectFeature;

describe('список проектов', () => {
  beforeEach(() => {
    api.fetchProjects.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('загружает список и проходит статусы loading → ready', async () => {
    let resolve: (value: Project[]) => void = () => undefined;
    api.fetchProjects.mockReturnValue(new Promise<Project[]>((r) => (resolve = r)));
    const store = setup();

    store.dispatch(actions.loadProjectsRequested());
    expect(selectors.selectProjectsStatus(store.getState())).toBe('loading');

    resolve([project('a'), project('b')]);
    await flush();
    expect(selectors.selectProjectsStatus(store.getState())).toBe('ready');
    expect(selectors.selectProjects(store.getState()).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('ошибка сети переводит список в статус error, данные не теряются', async () => {
    const store = setup();
    store.dispatch(actions.setProjects([project('a')]));
    api.fetchProjects.mockRejectedValue(new Error('offline'));

    store.dispatch(actions.loadProjectsRequested());
    await flush();

    expect(selectors.selectProjectsStatus(store.getState())).toBe('error');
    expect(selectors.selectProjects(store.getState())).toHaveLength(1);
  });

  it('upsert обновляет существующий проект и добавляет новый в начало', () => {
    const store = setup();
    store.dispatch(actions.setProjects([project('a'), project('b')]));
    store.dispatch(actions.upsertProject(project('b', { favorite: true })));
    store.dispatch(actions.upsertProject(project('c')));

    const ids = selectors.selectProjects(store.getState()).map((p) => p.id);
    expect(ids).toEqual(['c', 'a', 'b']);
    expect(selectors.selectProjects(store.getState())[2].favorite).toBe(true);
  });

  it('removeProjectLocal убирает проект без запроса к серверу', () => {
    const store = setup();
    store.dispatch(actions.setProjects([project('a'), project('b')]));
    store.dispatch(actions.removeProjectLocal('a'));

    expect(selectors.selectProjects(store.getState()).map((p) => p.id)).toEqual(['b']);
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it('сброс при смене пользователя возвращает статус idle', () => {
    const store = setup();
    store.dispatch(actions.setProjectsStatus('ready'));
    store.dispatch(actions.resetProjects());
    expect(selectors.selectProjectsStatus(store.getState())).toBe('idle');
  });
});
