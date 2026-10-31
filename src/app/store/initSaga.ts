import { put, call } from 'typed-redux-saga';
import { foldersApi, layoutsApi } from '@/app/api';
import { CreateProjectFeature } from '@/features/create-project';
import { actions as projectActions } from '@/features/create-project/slice';
import { foldersActions } from '@/features/folders';
import { actions as layoutActions } from '@/features/create-layout/slice';

/** Очистить данные предыдущего пользователя (при входе/выходе). */
export function* resetDataSaga() {
  yield* put(projectActions.resetProjects());
  yield* put(foldersActions.resetFolders());
  yield* put(layoutActions.resetLayouts());
}

/** Загрузить проекты, папки и макеты авторизованного пользователя. */
export function* initDataSaga() {
  yield* call(CreateProjectFeature.sagas.loadProjects);

  try {
    const folders = yield* call(foldersApi.fetchFolders);

    for (const folder of folders) {
      yield* put(foldersActions.addFolder(folder));
    }
  } catch (error: any) {
    console.error('Failed to load folders:', error);
  }

  try {
    const layouts = yield* call(layoutsApi.fetchLayouts);

    for (const layout of layouts) {
      yield* put(layoutActions.addLayout(layout));
    }
  } catch (error: any) {
    console.error('Failed to load layouts:', error);
  }
}
