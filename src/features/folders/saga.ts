/**
 * Саги для папок.
 * Отвечают за удаление папок и персистентность состава папки (проекты/макеты/подпапки)
 * на бэкенде. Поиск по папкам выполняется единым обработчиком в `features/search/saga`.
 * @module folders/saga
 */

import { takeLatest, takeEvery, select, all, call, put } from 'typed-redux-saga';
import { selectors } from './selectors';
import { actions } from './slice';
import { foldersApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { toast } from '@/shared/lib/toast';
import type { Folder } from './types';

/**
 * Изменения папок применяются в интерфейсе сразу (оптимистично). Если сервер их не
 * принял, пользователь видит причину, а список перечитывается с сервера — интерфейс
 * не расходится с сохранёнными данными.
 */
function* rollbackFolders(error: unknown, failure: string) {
  console.error(failure, error);
  yield* call(toast.error, apiErrorText(error, failure));
  try {
    const folders = yield* call(foldersApi.fetchFolders);
    yield* put(actions.replaceFolders(folders));
  } catch (reloadError) {
    console.error('Не удалось перечитать папки', reloadError);
  }
}

/**
 * Сохраняет текущее состояние папки на бэкенде.
 * Берёт уже обновлённую редьюсером папку из стейта и отправляет её целиком,
 * т.к. бэкенд заменяет документ при обновлении.
 */
function* persistFolder(folderId: string) {
  try {
    const folders = yield* select(selectors.selectFolders);
    const folder = folders.find((f: Folder) => f.id === folderId);
    if (!folder) return;

    yield* call(foldersApi.updateFolder, folder.id, {
      name: folder.name,
      description: folder.description,
      parentId: folder.parentId,
      projectIds: folder.projectIds,
      layoutIds: folder.layoutIds,
      childFolderIds: folder.childFolderIds,
    });
  } catch (error) {
    yield* call(rollbackFolders, error, 'Не удалось сохранить папку');
  }
}

function* handleProjectMembership(
  action: ReturnType<typeof actions.addProjectToFolder | typeof actions.removeProjectFromFolder>,
) {
  yield* persistFolder(action.payload.folderId);
}

function* handleLayoutMembership(
  action: ReturnType<typeof actions.addLayoutToFolder | typeof actions.removeLayoutFromFolder>,
) {
  yield* persistFolder(action.payload.folderId);
}

function* handleFolderMembership(
  action: ReturnType<typeof actions.addFolderToFolder | typeof actions.removeFolderFromFolder>,
) {
  yield* persistFolder(action.payload.parentFolderId);
}

function* handleRenameFolder(action: ReturnType<typeof actions.renameFolder>) {
  yield* persistFolder(action.payload.folderId);
}

function* handleDeleteFolder(action: ReturnType<typeof actions.removeFolder>) {
  try {
    yield* call(foldersApi.deleteFolder, action.payload);
  } catch (error) {
    yield* call(rollbackFolders, error, 'Не удалось удалить папку');
  }
}

export function* initSaga() {
  yield all([
    takeLatest(actions.removeFolder.type, handleDeleteFolder),
    takeEvery(actions.addProjectToFolder.type, handleProjectMembership),
    takeEvery(actions.removeProjectFromFolder.type, handleProjectMembership),
    takeEvery(actions.addLayoutToFolder.type, handleLayoutMembership),
    takeEvery(actions.removeLayoutFromFolder.type, handleLayoutMembership),
    takeEvery(actions.addFolderToFolder.type, handleFolderMembership),
    takeEvery(actions.removeFolderFromFolder.type, handleFolderMembership),
    takeLatest(actions.renameFolder.type, handleRenameFolder),
  ]);
}
