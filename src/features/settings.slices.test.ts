/**
 * Небольшие слайсы настроек и интерфейса: ассеты, камера, графика, тема, окружение,
 * выделение, модальные окна, поиск, универсальная кнопка, формы создания.
 */
import { describe, expect, it } from 'vitest';
import { actions as assets, reducer as assetsReducer } from './assets/slice';
import { EMPTY_MANIFEST } from './assets/lib/manifest';
import { actions as camera, reducer as cameraReducer } from './camera/slice';
import { actions as createFolder, reducer as createFolderReducer } from './create-folder/slice';
import { actions as createLayout, reducer as createLayoutReducer } from './create-layout/slice';
import { actions as createProject, reducer as createProjectReducer } from './create-project/slice';
import { actions as environment, reducer as environmentReducer } from './environment/slice';
import { actions as graphics, reducer as graphicsReducer } from './graphics/slice';
import { actions as modals, reducer as modalsReducer } from './modals/slice';
import { actions as search, reducer as searchReducer } from './search/slice';
import { actions as selection, reducer as selectionReducer } from './selection/slice';
import { actions as theme, reducer as themeReducer } from './theme/slice';
import { actions as universal, reducer as universalReducer } from './universal-button/slice';

const init = { type: 'init' };

describe('assets slice', () => {
  it('статусы загрузки манифеста', () => {
    let state = assetsReducer(undefined, assets.loadManifestRequested());
    expect(state.status).toBe('loading');
    state = assetsReducer(state, assets.manifestLoaded(EMPTY_MANIFEST));
    expect(state.status).toBe('ready');
    state = assetsReducer(state, assets.manifestFailed('нет сети'));
    expect(state).toMatchObject({ status: 'error', error: 'нет сети' });
  });
});

describe('camera slice', () => {
  it('режимы и фикс-виды увеличивают счётчик запроса вида', () => {
    let state = cameraReducer(undefined, camera.setMode('fps'));
    expect(state).toMatchObject({ mode: 'fps', viewRequest: 1 });
    state = cameraReducer(state, camera.setFixedView('left'));
    expect(state).toMatchObject({ mode: 'fixed', fixedView: 'left', viewRequest: 2 });
    state = cameraReducer(state, camera.resetView());
    state = cameraReducer(state, camera.setCollisions(false));
    expect(state).toMatchObject({ viewRequest: 3, collisions: false });
  });
});

describe('graphics slice', () => {
  it('пресет и ручная настройка переводят в «Своя»', () => {
    let state = graphicsReducer(undefined, graphics.setPreset('low'));
    expect(state.preset).toBe('low');
    state = graphicsReducer(state, graphics.updateGraphics({ showFps: !state.showFps, shadowMapSize: 4096 }));
    expect(state.preset).toBe('custom');
  });
});

describe('theme slice', () => {
  it('по умолчанию — как в системе', () => {
    const state = themeReducer(undefined, init);
    expect(state.mode).toBe('system');
    expect(themeReducer(state, theme.setThemeMode('dark')).mode).toBe('dark');
  });
});

describe('environment slice', () => {
  it('частичные изменения солнца и неба, загрузка и сброс', () => {
    const initial = environmentReducer(undefined, init);
    let state = environmentReducer(initial, environment.setSun({ timeOfDay: 18 }));
    state = environmentReducer(state, environment.setSky({ exposure: 1.5 }));
    expect(state.sun.timeOfDay).toBe(18);
    expect(state.sun.side).toBe(initial.sun.side);
    expect(state.sky.exposure).toBe(1.5);
    expect(environmentReducer(initial, environment.loadEnvironment(state))).toEqual(state);
    expect(environmentReducer(state, environment.resetEnvironment())).toEqual(initial);
  });
});

describe('selection slice', () => {
  it('выделение, наведение и сброс', () => {
    let state = selectionReducer(undefined, selection.select({ kind: 'furniture', id: 'f1' } as never));
    state = selectionReducer(state, selection.setHovered('f2'));
    expect(state).toMatchObject({ current: { id: 'f1' }, hoveredId: 'f2' });
    expect(selectionReducer(state, selection.clearSelection()).current).toBeNull();
  });
});

describe('modals slice', () => {
  it('открытие/закрытие окон и ошибки', () => {
    let state = modalsReducer(undefined, modals.openCreateProjectModal());
    state = modalsReducer(state, modals.openCreateFolderModal());
    state = modalsReducer(state, modals.openCreateLayoutModal());
    expect(state).toMatchObject({ isCreateProjectModalOpen: true, isCreateFolderModalOpen: true, isCreateLayoutModalOpen: true });
    state = modalsReducer(state, modals.setProjectCreationError('a'));
    state = modalsReducer(state, modals.setFolderCreationError('b'));
    state = modalsReducer(state, modals.setLayoutCreationError('c'));
    expect(state).toMatchObject({ projectCreationError: 'a', folderCreationError: 'b', layoutCreationError: 'c' });
    state = modalsReducer(state, modals.closeCreateProjectModal());
    state = modalsReducer(state, modals.closeCreateFolderModal());
    state = modalsReducer(state, modals.closeCreateLayoutModal());
    expect(state).toMatchObject({ isCreateProjectModalOpen: false, isCreateFolderModalOpen: false, isCreateLayoutModalOpen: false });
  });
});

describe('search slice', () => {
  it('запрос, результаты, подсветка и очистка', () => {
    let state = searchReducer(undefined, search.setSearchQuery('кух'));
    expect(state.isSearching).toBe(true);
    state = searchReducer(state, search.setSearchResults(['p1', 'p2']));
    expect(state).toMatchObject({ foundProjectId: 'p1', isSearching: false });
    state = searchReducer(state, search.setSearchResults([]));
    expect(state.foundProjectId).toBeNull();
    state = searchReducer(state, search.setHighlightedIds(['p1']));
    state = searchReducer(state, search.setHighlightedFolderIds(['f1']));
    state = searchReducer(state, search.setSearchInputValue('кух'));
    state = searchReducer(state, search.setActiveMenuId('p1'));
    expect(state).toMatchObject({ highlightedIds: ['p1'], highlightedFolderIds: ['f1'], inputValue: 'кух', activeMenuId: 'p1' });
    expect(searchReducer(state, search.clearSearch())).toEqual(searchReducer(undefined, init));
  });
});

describe('universal button slice', () => {
  it('открытие и закрытие', () => {
    const open = universalReducer(undefined, universal.openModal());
    expect(open.isOpen).toBe(true);
    expect(universalReducer(open, universal.closeModal()).isOpen).toBe(false);
  });
});

describe('формы создания (проект, папка, шаблон)', () => {
  it('create-project: форма, загрузка и список', () => {
    let state = createProjectReducer(undefined, createProject.setProjectName('Гостиная'));
    state = createProjectReducer(state, createProject.setIsLoading(true));
    state = createProjectReducer(state, createProject.setError('Ошибка'));
    expect(state).toMatchObject({ projectName: 'Гостиная', isLoading: false, error: 'Ошибка' });
    state = createProjectReducer(state, createProject.resetForm());
    expect(state).toMatchObject({ projectName: '', error: null });
    const project = { id: 'p1', name: 'A', status: 'active' as const, createdAt: '2026-01-01' };
    state = createProjectReducer(state, createProject.addProject(project));
    state = createProjectReducer(state, createProject.createProjectRequested());
    state = createProjectReducer(state, createProject.loadProjectsRequested());
    expect(state.projects).toHaveLength(1);
    state = createProjectReducer(state, createProject.removeProject('p1'));
    expect(state.projects).toHaveLength(0);
  });

  it('create-folder: форма и сброс', () => {
    let state = createFolderReducer(undefined, createFolder.setFolderName('Работа'));
    state = createFolderReducer(state, createFolder.setIsLoading(true));
    state = createFolderReducer(state, createFolder.setError('Ошибка'));
    expect(state).toMatchObject({ folderName: 'Работа', isLoading: false, error: 'Ошибка' });
    state = createFolderReducer(state, createFolder.createFolderRequested());
    expect(createFolderReducer(state, createFolder.resetForm())).toEqual(createFolderReducer(undefined, init));
  });

  it('create-layout: форма и список шаблонов', () => {
    let state = createLayoutReducer(undefined, createLayout.setLayoutName('Мой шаблон'));
    state = createLayoutReducer(state, createLayout.setIsLoading(true));
    state = createLayoutReducer(state, createLayout.setError('Ошибка'));
    expect(state).toMatchObject({ layoutName: 'Мой шаблон', isLoading: false, error: 'Ошибка' });
    state = createLayoutReducer(state, createLayout.resetForm());
    state = createLayoutReducer(state, createLayout.addLayout({ id: 'l1', name: 'A' }));
    state = createLayoutReducer(state, createLayout.upsertLayout({ id: 'l1', name: 'B' }));
    state = createLayoutReducer(state, createLayout.upsertLayout({ id: 'l2', name: 'C' }));
    expect(state.layouts.map((l) => `${l.id}:${l.name}`)).toEqual(['l2:C', 'l1:B']);
    state = createLayoutReducer(state, createLayout.createLayoutRequested());
    state = createLayoutReducer(state, createLayout.removeLayout('l1'));
    expect(state.layouts.map((l) => l.id)).toEqual(['l2']);
    expect(createLayoutReducer(state, createLayout.resetLayouts())).toEqual(createLayoutReducer(undefined, init));
  });
});
