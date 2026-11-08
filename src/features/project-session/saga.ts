/**
 * Саги сессии проекта.
 *
 * Открытие: сервер → (если есть более свежие несохранённые правки — локальная копия)
 * → разбор и миграция документа → загрузка сцены → восстановление камеры.
 * Без связи открывается локальная копия.
 * Автосохранение: через 1.5 с после последней правки; локальная копия — через 0.4 с.
 * Сохранения идут по одному; правки, сделанные во время запроса, отправляет следующее.
 * Ошибки сети повторяются с паузой; правки при этом не теряются (локальная копия).
 * @module project-session/saga
 */

import { channel, type Channel } from 'redux-saga';
import { call, debounce, delay, put, select, take, takeEvery, takeLatest } from 'typed-redux-saga';
import { projectsApi } from '@/app/api';
import { ApiRequestError } from '@/app/api/client';
import type { SaveProjectInput } from '@/app/api/projects';
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

/** Что уходит на сервер: тело запроса и номер правки сцены, на которой оно собрано. */
interface SaveDraft {
  id: string;
  payload: SaveProjectInput;
  key: string;
  thumbnail: string | null;
  /** Время сборки (мс) */
  at: number;
  revision: number;
}

/** Открыт ли ещё проект id: сохранение могло ждать очереди или ответа, пока открыли другой. */
function* isOpen(id: string): Generator<unknown, boolean> {
  return (yield* select(selectors.selectSessionProjectId)) === id;
}

/** Статус сохранения проекта id — только если он ещё открыт. */
function* putIfOpen(id: string, action: ReturnType<typeof actions.setSaveState> | ReturnType<typeof actions.saved>) {
  if (yield* isOpen(id)) yield* put(action);
}

/** Выполнить сохранение в свою очередь: следующее начнётся после окончания этого. */
function* inTurn(turn: Channel<true>, work: Generator<unknown, void>) {
  yield* take(turn);
  try {
    yield* work;
  } finally {
    turn.put(true);
  }
}

/**
 * Создать сохранение с памятью о последнем сохранённом состоянии.
 * `noteEdit` вызывается на каждую правку сцены: по номеру правки сохранение видит, что сцена
 * изменилась, пока шёл запрос. Документ с отправленным не сравниваем: смена этажа и измерение
 * габаритов моделей меняют его, но правками не считаются и автосохранение не запускают —
 * статус остался бы «Есть изменения» без сохранения.
 */
function createSaver() {
  let lastKey = '';
  let lastThumbnailAt = 0;
  let warned = false;
  let revision = 0;
  /**
   * Очередь: сохранения идут одно за другим — запросы не перекрываются, и ответ на старый не перепишет
   * статус и lastKey нового. Поэтому задачи сохранения не отменяются (takeEvery, а не takeLatest):
   * отмена освободила бы очередь при неотвеченном запросе.
   */
  const turn = channel<true>();
  turn.put(true);

  /** Собрать сохранение текущей сцены (null — сохранять нечего или документ повреждён). */
  function* prepare(force: boolean): Generator<unknown, SaveDraft | null> {
    const id = yield* select(selectors.selectSessionProjectId);
    const status = yield* select(selectors.selectSessionStatus);
    if (!id || status !== 'ready') return null;
    const project = (yield* select(CreateProjectFeature.selectors.selectProjects)).find((p) => p.id === id);
    if (!project) return null;
    // Номер правки — до документа: правка между ними даст лишнее сохранение, а не потерянное.
    const draftRevision = revision;
    const doc = yield* select(selectSceneDocument);
    if (!sceneDocumentSchema.safeParse(doc).success) {
      console.error('Документ сцены не прошёл проверку перед сохранением', doc);
      yield* put(actions.setSaveState('error'));
      return null;
    }
    const at = Date.now();
    const thumbnail = force || at - lastThumbnailAt > THUMBNAIL_INTERVAL_MS ? sceneBridge.capture(480) : null;
    const payload = buildSavePayload({ project, doc, camera: cameraSession.getState().pose, thumbnail });
    return { id, payload, key: `${id} ${payloadKey(payload)}`, thumbnail, at, revision: draftRevision };
  }

  /** Отправить с повторами при сбоях сети; null — не удалось (статус и предупреждение уже показаны). */
  function* send(id: string, payload: SaveProjectInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return yield* call(projectsApi.updateProject, id, payload);
      } catch (error) {
        if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length) {
          console.error('Не удалось сохранить проект', error);
          yield* putIfOpen(id, actions.setSaveState(isOffline(error) ? 'offline' : 'error'));
          if (!warned) toast.error('Не удалось сохранить на сервер — изменения сохранены на этом устройстве');
          warned = true;
          return null;
        }
        yield* delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  /** Отправить собранное сохранение (в своей очереди). */
  function* commit(draft: SaveDraft, force: boolean) {
    if (!force && draft.key === lastKey) {
      // На сервере уже ровно это (например, правку отменили, пока шёл предыдущий запрос)
      markBackupSynced(draft.id);
      yield* putIfOpen(draft.id, actions.setSaveState('saved'));
      return;
    }
    yield* putIfOpen(draft.id, actions.setSaveState('saving'));
    writeBackup(draft.id, { roomData: draft.payload.roomData, camera: cameraSession.getState().pose, savedAt: new Date(draft.at).toISOString(), synced: false });
    const updated = yield* send(draft.id, draft.payload);
    if (!updated) return;
    yield* put(CreateProjectFeature.actions.upsertProject(updated));
    lastKey = draft.key;
    if (draft.thumbnail) lastThumbnailAt = draft.at;
    warned = false;
    if (revision !== draft.revision && (yield* isOpen(draft.id))) {
      // Правки этого проекта во время запроса на сервер не попали: копия на устройстве новее сервера,
      // статус — «Есть изменения»; их отправит автосохранение, которое эти правки запустили.
      yield* put(actions.setSaveState('dirty'));
      return;
    }
    markBackupSynced(draft.id);
    yield* putIfOpen(draft.id, actions.saved(new Date().toISOString()));
  }

  function* saveCurrent(force: boolean) {
    const draft = yield* prepare(force);
    if (draft) yield* commit(draft, force);
  }

  return {
    /** Учесть правку сцены (каждое действие из AUTOSAVE_TRIGGERS). */
    noteEdit: () => {
      revision += 1;
    },
    /** Сохранить сцену, какой она будет в начале своей очереди (force — даже без изменений, с превью). */
    save: (force: boolean) => inTurn(turn, saveCurrent(force)),
    /**
     * Сохранить сцену, какой её оставили при закрытии: снимок — сразу, отправка — в своей очереди
     * (пока она подойдёт, может открыться другой проект со своей сценой).
     */
    *saveOnClose() {
      const draft = yield* prepare(false);
      if (draft) yield* inTurn(turn, commit(draft, false));
    },
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
  const { save, saveOnClose, noteEdit } = createSaver();
  /** Сколько раз открывали проект: закрытие, ждавшее сохранения, не очищает сцену открытого после него. */
  let openings = 0;

  /** Закрыть проект: сохранить изменения и очистить сцену (если с тех пор не открыли проект — другой или тот же). */
  function* closeSaga() {
    const id = yield* select(selectors.selectSessionProjectId);
    const opening = openings;
    const saveState = yield* select(selectors.selectSaveState);
    if (id && saveState !== 'saved') yield* call(saveOnClose);
    if (openings !== opening || (yield* select(selectors.selectSessionProjectId)) !== id) return;
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

  yield* takeEvery(actions.openRequested.type, () => {
    openings += 1;
  });
  yield* takeLatest(actions.openRequested.type, openSaga);
  yield* takeEvery(AUTOSAVE_TRIGGERS, noteEdit);
  yield* takeEvery(AUTOSAVE_TRIGGERS, markDirtySaga);
  yield* debounce(BACKUP_DELAY_MS, AUTOSAVE_TRIGGERS, backupSaga);
  yield* debounce(AUTOSAVE_DELAY_MS, AUTOSAVE_TRIGGERS, () => save(false));
  // Сохранения не отменяются (см. очередь в createSaver): повторное «Сохранить» встаёт в очередь
  yield* takeEvery(actions.saveNowRequested.type, () => save(true));
  yield* takeLatest(actions.thumbnailRequested.type, thumbnailSaga);
  yield* takeEvery(actions.closeRequested.type, closeSaga);
}
