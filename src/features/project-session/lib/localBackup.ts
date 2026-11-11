/**
 * Локальная копия проекта (localStorage): защита от потери правок при обрыве связи,
 * закрытии вкладки или ошибке сервера. Копия помечается «не синхронизирована»,
 * пока сервер не подтвердит сохранение. Копия привязана к владельцу (`userId`): чужую копию
 * (другой аккаунт, гость, старый формат без владельца) без связи с сервером не открываем.
 * @module project-session/lib/localBackup
 */

import { z } from 'zod';
import { cameraPoseSchema, type CameraPose } from '@/features/camera/model/cameraSession';

const PREFIX = 'vrhc:backup:';

/** Локальная копия. */
export interface LocalBackup {
  /** Документ сцены (проверяется отдельно при открытии) */
  roomData: unknown;
  camera: CameraPose | null;
  /** Время сохранения копии (ISO) */
  savedAt: string;
  /** Подтверждено ли сохранение на сервере */
  synced: boolean;
  /**
   * Кто сохранил копию. Нет у копий старого формата: они никому не принадлежат —
   * офлайн не открываются, а при связи сервер сам подтверждает, чей это проект.
   */
  userId?: string;
}

const backupSchema = z.object({
  roomData: z.unknown(),
  camera: cameraPoseSchema.nullable(),
  savedAt: z.string().max(40),
  synced: z.boolean(),
  userId: z.string().min(1).max(128).optional(),
});

/**
 * Копии, которые localStorage не принял (переполнен или недоступен): живут в памяти вкладки
 * до перезагрузки страницы — правки доживают хотя бы до входа или повторного открытия проекта.
 */
const inMemory = new Map<string, LocalBackup>();

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Записать копию (ошибка квоты не прерывает работу: копия остаётся в памяти вкладки). */
export function writeBackup(projectId: string, backup: LocalBackup): void {
  try {
    const store = storage();
    if (!store) throw new Error('localStorage недоступен');
    store.setItem(PREFIX + projectId, JSON.stringify(backup));
    inMemory.delete(projectId);
  } catch (error) {
    inMemory.set(projectId, backup);
    console.warn('Не удалось сохранить локальную копию проекта — до перезагрузки страницы она хранится в памяти', error);
  }
}

/** Прочитать копию (null — нет или повреждена). Копия в памяти новее записанной. */
export function readBackup(projectId: string): LocalBackup | null {
  const kept = inMemory.get(projectId);
  if (kept) return kept;
  try {
    const raw = storage()?.getItem(PREFIX + projectId);
    if (!raw) return null;
    const parsed = backupSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Отметить копию как синхронизированную с сервером. */
export function markBackupSynced(projectId: string): void {
  const backup = readBackup(projectId);
  if (backup) writeBackup(projectId, { ...backup, synced: true });
}

/** Копия принадлежит этому пользователю (копия без владельца и гость — не свои). */
export function isOwnBackup(backup: LocalBackup | null, userId: string | null): backup is LocalBackup {
  return backup !== null && userId !== null && backup.userId === userId;
}

/** Новая несинхронизированная копия правок; владелец пишется, если пользователь известен. */
export function unsyncedBackup(roomData: unknown, camera: CameraPose | null, userId: string | null, now: Date = new Date()): LocalBackup {
  return { roomData, camera, savedAt: now.toISOString(), synced: false, ...(userId ? { userId } : {}) };
}

/** Есть ли своя копия, которую сервер ещё не подтвердил (правки только на этом устройстве). */
export function hasUnsyncedBackup(projectId: string, userId: string | null): boolean {
  const backup = readBackup(projectId);
  return isOwnBackup(backup, userId) && !backup.synced;
}

/** Удалить копию (проект удалён). */
export function removeBackup(projectId: string): void {
  inMemory.delete(projectId);
  try {
    storage()?.removeItem(PREFIX + projectId);
  } catch {
    /* хранилище недоступно — удалять нечего */
  }
}

/**
 * Нужно ли открыть локальную копию вместо серверной версии: копия не синхронизирована,
 * новее последнего изменения на сервере и не чужая. Копия без владельца (старый формат)
 * допускается: раз сервер отдал проект, он принадлежит текущему пользователю.
 */
export function shouldPreferBackup(backup: LocalBackup | null, serverUpdatedAt: string | undefined, userId: string | null): boolean {
  if (!backup || backup.synced) return false;
  if (backup.userId !== undefined && backup.userId !== userId) return false;
  if (!serverUpdatedAt) return true;
  return Date.parse(backup.savedAt) > Date.parse(serverUpdatedAt);
}
