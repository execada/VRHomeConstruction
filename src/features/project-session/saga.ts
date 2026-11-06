/**
 * Саги сессии проекта.
 *
 * Открытие: сервер → (если есть более свежие несохранённые правки — локальная копия)
 * → разбор и миграция документа → загрузка сцены → восстановление камеры.
 * Без связи открывается локальная копия.
 * Автосохранение: через 1.5 с после последней правки; локальная копия — через 0.4 с.
 * Ошибки сети повторяются с паузой; правки при этом не теряются (локальная копия).
 * @module project-session/saga
 */

import { call, debounce, delay, put, select, takeEvery, takeLatest } from 'typed-redux-saga';
import { projectsApi } from '@/app/api';
import { ApiRequestError } from '@/app/api/client';
import type { ProjectDetails } from '@/app/api/schemas';
import { setRestorePose, cameraSession } from '@/features/camera/model/cameraSession';
import { CreateProjectFeature } from '@/features/create-project';
import type { Project } from '@/features/create-project/types';
import { parseSceneDocument } from '@/features/editor-3d/lib/scene/parse';
import { sceneDocumentSchema, type SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import { sceneLoadActions } from '@/features/editor-3d/sceneActions';
import { SCENE_EDIT_ACTION_TYPES } from '@/features/editor-3d/sceneActionTypes';
import { selectSceneDocument } from '@/features/editor-3d/sceneSelectors';
import { sceneBridge } from '@/features/editor-3d/model/sceneBridge';
import { interaction } from '@/features/editor-3d/model/interactionStore';
import { actions as buildingActions } from '@/features/editor-3d/building/slice';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { actions as environmentActions } from '@/features/environment/slice';
import { HistoryFeature } from '@/features/history';
import { SelectionFeature } from '@/features/selection';
import { toast } from '@/shared/lib/toast';
import { markBackupSynced, readBackup, shouldPreferBackup, writeBackup } from './lib/localBackup';
import { buildSavePayload, cameraFromProject, payloadKey } from './lib/payload';
import { selectors } from './selectors';
import { actions } from './slice';

const AUTOSAVE_DELAY_MS = 1500;
const BACKUP_DELAY_MS = 400;
const THUMBNAIL_INTERVAL_MS = 60_000;
const RETRY_DELAYS_MS = [1000, 3000];
/** Правки сцены и отмена/повтор — поводы для автосохранения. */
const AUTOSAVE_TRIGGERS = [...SCENE_EDIT_ACTION_TYPES, HistoryFeature.actions.stepBack.type, HistoryFeature.actions.stepForward.type];

/** Ошибка, которую имеет смысл повторить (нет связи, перегрузка, сбой сервера). */
function isRetryable(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 0 || error.status === 429 || error.status >= 500);
}

function isOffline(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 0;
}

/** Понятное сообщение об ошибке открытия. */
function openErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 404) return 'Проект не найден или был удалён';
  if (error instanceof ApiRequestError && error.status === 401) return 'Войдите в аккаунт, чтобы открыть проект';
  return error instanceof Error ? error.message : 'Не удалось открыть проект';
}

/** Применить документ сцены ко всем слайсам. */
function* applyScene(doc: SceneDocument) {
  for (const action of sceneLoadActions(doc)) yield* put(action);
}

/** Применить данные (сервер или копия): разбор, загрузка сцены, предупреждения. */
function* loadRoomData(roomData: unknown) {
  const parsed = parseSceneDocument(roomData ?? {});
  if (!parsed.ok) throw new Error(parsed.error);
  yield* applyScene(parsed.doc);
  if (parsed.dropped > 0) toast.info(`Пропущено повреждённых объектов: ${parsed.dropped}`);
}

function toMeta(details: ProjectDetails): Project {
  const { roomData: _room, playerPosition: _p, playerRotation: _r, ...meta } = details;
  return meta;
}

function* openSaga(action: ReturnType<typeof actions.openRequested>) {
  const id = action.payload;
  const backup = readBackup(id);
  try {
    const project = yield* call(projectsApi.fetchProject, id);
    yield* put(CreateProjectFeature.actions.upsertProject(toMeta(project)));
    const preferBackup = shouldPreferBackup(backup, project.updatedAt);
    yield* loadRoomData(preferBackup && backup ? backup.roomData : project.roomData);
    setRestorePose(preferBackup && backup ? backup.camera : cameraFromProject(project.roomData, project.playerPosition, project.playerRotation));
    if (preferBackup) toast.info('Восстановлены несохранённые изменения — сохраняем на сервер');
    yield* put(actions.opened({ fromLocalBackup: preferBackup }));
    if (preferBackup) yield* put(actions.saveNowRequested());
  } catch (error) {
    if (isOffline(error) && backup) {
      try {
        yield* loadRoomData(backup.roomData);
        setRestorePose(backup.camera);
        toast.info('Нет связи с сервером — открыта локальная копия проекта');
        yield* put(actions.opened({ fromLocalBackup: true }));
        yield* put(actions.setSaveState('offline'));
        return;
      } catch (backupError) {
        console.error('Локальная копия проекта повреждена', backupError);
      }
    }
    console.error('Не удалось открыть проект', error);
    yield* put(actions.openFailed(openErrorMessage(error)));
  }
}

/**
 * Отметить несохранённые правки сразу (локальная копия пишется с задержкой): статус
 * в шапке честный с первой правки, а закрытие вкладки до записи копии её не теряет.
 */
function* markDirtySaga() {
  const status = yield* select(selectors.selectSessionStatus);
  const saveState = yield* select(selectors.selectSaveState);
  if (status === 'ready' && saveState === 'saved') yield* put(actions.setSaveState('dirty'));
}

/** Записать локальную копию текущей сцены (без сервера). */
function* backupSaga() {
  const id = yield* select(selectors.selectSessionProjectId);
  const status = yield* select(selectors.selectSessionStatus);
  if (!id || status !== 'ready') return;
  const doc = yield* select(selectSceneDocument);
  writeBackup(id, { roomData: doc, camera: cameraSession.getState().pose, savedAt: new Date().toISOString(), synced: false });
  yield* put(actions.setSaveState('dirty'));
}

/** Создать сагу сохранения с памятью о последнем сохранённом состоянии. */
function createSaver() {
  let lastKey = '';
  let lastThumbnailAt = 0;
  let warned = false;

  return function* saveSaga(force: boolean) {
    const id = yield* select(selectors.selectSessionProjectId);
    const status = yield* select(selectors.selectSessionStatus);
    if (!id || status !== 'ready') return;
    const project = (yield* select(CreateProjectFeature.selectors.selectProjects)).find((p) => p.id === id);
    if (!project) return;
    const doc = yield* select(selectSceneDocument);
    if (!sceneDocumentSchema.safeParse(doc).success) {
      console.error('Документ сцены не прошёл проверку перед сохранением', doc);
      yield* put(actions.setSaveState('error'));
      return;
    }
    const now = Date.now();
    const thumbnail = force || now - lastThumbnailAt > THUMBNAIL_INTERVAL_MS ? sceneBridge.capture(480) : null;
    const payload = buildSavePayload({ project, doc, camera: cameraSession.getState().pose, thumbnail });
    const key = payloadKey(payload);
    if (!force && key === lastKey) {
      yield* put(actions.setSaveState('saved'));
      return;
    }
    yield* put(actions.setSaveState('saving'));
    writeBackup(id, { roomData: payload.roomData, camera: cameraSession.getState().pose, savedAt: new Date(now).toISOString(), synced: false });

    for (let attempt = 0; ; attempt += 1) {
      try {
        const updated = yield* call(projectsApi.updateProject, id, payload);
        yield* put(CreateProjectFeature.actions.upsertProject(updated));
        markBackupSynced(id);
        lastKey = key;
        if (thumbnail) lastThumbnailAt = now;
        warned = false;
        yield* put(actions.saved(new Date().toISOString()));
        return;
      } catch (error) {
        if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length) {
          console.error('Не удалось сохранить проект', error);
          yield* put(actions.setSaveState(isOffline(error) ? 'offline' : 'error'));
          if (!warned) toast.error('Не удалось сохранить на сервер — изменения сохранены на этом устройстве');
          warned = true;
          return;
        }
        yield* delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  };
}

/** Сохранить превью проекта, если его ещё нет: новый проект из шаблона без правок иначе остался бы без картинки. */
function* thumbnailSaga() {
  const id = yield* select(selectors.selectSessionProjectId);
  const status = yield* select(selectors.selectSessionStatus);
  if (!id || status !== 'ready') return;
  const project = (yield* select(CreateProjectFeature.selectors.selectProjects)).find((p) => p.id === id);
  if (!project || project.thumbnail) return;
  const thumbnail = sceneBridge.capture(480);
  if (!thumbnail) return;
  try {
    const updated = yield* call(projectsApi.patchProject, id, { thumbnail });
    yield* put(CreateProjectFeature.actions.upsertProject(updated));
  } catch (error) {
    console.warn('Не удалось сохранить превью проекта', error);
  }
}

/** Корневая сага сессии */
export function* initSaga() {
  const save = createSaver();

  /** Закрыть проект: сохранить изменения и очистить сцену (если не открыт другой). */
  function* closeSaga() {
    const id = yield* select(selectors.selectSessionProjectId);
    const saveState = yield* select(selectors.selectSaveState);
    if (id && saveState !== 'saved') yield* call(save, false);
    if ((yield* select(selectors.selectSessionProjectId)) !== id) return;
    interaction.reset();
    setRestorePose(null);
    yield* put(editorActions.resetEditor());
    yield* put(buildingActions.reset());
    yield* put(furnitureActions.resetFurniture());
    yield* put(environmentActions.resetEnvironment());
    yield* put(HistoryFeature.actions.clearHistory());
    yield* put(SelectionFeature.actions.clearSelection());
    yield* put(actions.resetSession());
  }

  yield* takeLatest(actions.openRequested.type, openSaga);
  yield* takeEvery(AUTOSAVE_TRIGGERS, markDirtySaga);
  yield* debounce(BACKUP_DELAY_MS, AUTOSAVE_TRIGGERS, backupSaga);
  yield* debounce(AUTOSAVE_DELAY_MS, AUTOSAVE_TRIGGERS, () => save(false));
  yield* takeLatest(actions.saveNowRequested.type, () => save(true));
  yield* takeLatest(actions.thumbnailRequested.type, thumbnailSaga);
  yield* takeLatest(actions.closeRequested.type, closeSaga);
}
