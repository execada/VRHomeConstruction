import { all, call, fork, put, takeLatest } from 'redux-saga/effects';
import { UserFeature } from '@/features/user';
import { actions as userActions } from '@/features/user/slice';
import { CreateProjectFeature } from '@/features/create-project';
import { FoldersFeature } from '@/features/folders';
import { CreateFolderFeature } from '@/features/create-folder';
import { CreateLayoutFeature } from '@/features/create-layout';
import { SearchFeature } from '@/features/search';
import { CameraFeature } from '@/features/camera';
import { GraphicsFeature } from '@/features/graphics';
import { SelectionFeature } from '@/features/selection';
import { HistoryFeature } from '@/features/history';
import { ThemeFeature } from '@/features/theme';
import { NotificationsFeature } from '@/features/notifications';
import { AssetsFeature } from '@/features/assets';
import { ProjectSessionFeature } from '@/features/project-session';
import { initSaga as editorSaga } from '@/features/editor-3d/saga';
import { initSaga as furnitureSaga } from '@/features/furniture/saga';
import { initDataSaga, resetDataSaga } from './initSaga';

/** Вход выполнен: убрать данные предыдущего пользователя и загрузить свои. */
function* onUserSignedIn() {
  yield call(resetDataSaga);
  yield call(initDataSaga);
}

/** Выход: очистить пользовательские данные (без перезагрузки страницы). */
function* onUserSignedOut() {
  yield call(resetDataSaga);
}

export function* rootSaga(): Generator<any, void, any> {
  yield all([
    fork(UserFeature.sagas.init),
    fork(CreateProjectFeature.sagas.init),
    fork(FoldersFeature.sagas.init),
    fork(CreateFolderFeature.sagas.init),
    fork(CreateLayoutFeature.sagas.init),
    fork(SearchFeature.sagas.init),
    fork(editorSaga),
    fork(furnitureSaga),
    fork(CameraFeature.sagas.init),
    fork(GraphicsFeature.sagas.init),
    fork(SelectionFeature.sagas.init),
    fork(HistoryFeature.sagas.init),
    fork(ThemeFeature.sagas.init),
    fork(NotificationsFeature.sagas.init),
    fork(AssetsFeature.sagas.init),
    fork(ProjectSessionFeature.sagas.init),
  ]);

  // Данные загружаются по факту входа (setUser), а не безусловно при старте:
  // восстановление сессии из localStorage тоже диспатчит setUser.
  yield takeLatest(userActions.setUser.type, onUserSignedIn);
  yield takeLatest(userActions.logout.type, onUserSignedOut);

  yield put(userActions.restoreSessionRequested());
}
