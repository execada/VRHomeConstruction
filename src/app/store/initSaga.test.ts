import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { CreateFolderFeature } from '@/features/create-folder';
import { CreateLayoutFeature } from '@/features/create-layout';
import { CreateProjectFeature } from '@/features/create-project';
import { FoldersFeature } from '@/features/folders';
import { ModalsFeature } from '@/features/modals';
import { resetDataSaga } from './initSaga';

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: {
      ...CreateProjectFeature.reducer,
      ...FoldersFeature.reducer,
      ...CreateLayoutFeature.reducer,
      ...ModalsFeature.reducer,
      ...CreateFolderFeature.reducer,
    },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  return { store, run: () => saga.run(resetDataSaga).toPromise() };
}

describe('resetDataSaga (вход и выход)', () => {
  it('убирает данные и открытое окно новой папки предыдущего пользователя', async () => {
    const { store, run } = setup();
    store.dispatch(CreateProjectFeature.actions.addProject({ id: 'p1', name: 'Гостиная', status: 'active', createdAt: '2026-01-01T00:00:00Z' }));
    store.dispatch(ModalsFeature.actions.openCreateFolderModal());
    store.dispatch(CreateFolderFeature.actions.setFolderName('Квартира'));

    await run();

    expect(CreateProjectFeature.selectors.selectProjects(store.getState())).toEqual([]);
    expect(ModalsFeature.selectors.selectIsCreateFolderModalOpen(store.getState())).toBe(false);
    expect(CreateFolderFeature.selectors.selectFolderName(store.getState())).toBe('');
  });
});
