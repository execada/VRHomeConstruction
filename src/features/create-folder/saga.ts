import { takeLatest, put, select, all, call } from 'typed-redux-saga';
import { ModalsFeature } from '@/features/modals';
import { foldersActions } from '@/features/folders';
import { actions } from './slice';
import { selectors } from './selectors';
import { foldersApi } from '@/app/api';

function* handleCreateFolder() {
  try {
    const folderName = yield* select(selectors.selectFolderName);
    const trimmedName = folderName.trim();

    if (!trimmedName) {
      throw new Error('Введите название папки');
    }

    yield* put(actions.setIsLoading(true));
    yield* put(actions.setError(null));

    const folder = yield* call(foldersApi.createFolder, trimmedName, null);

    yield* put(foldersActions.addFolder(folder));
    yield* put(actions.resetForm());
    yield* put(ModalsFeature.actions.closeCreateFolderModal());
  } catch (error: any) {
    const errorMessage = error.message || 'Ошибка при создании папки';
    yield* put(actions.setError(errorMessage));
  } finally {
    yield* put(actions.setIsLoading(false));
  }
}

export function* initSaga() {
  yield all([
    takeLatest(actions.createFolderRequested.type, handleCreateFolder),
  ]);
}
