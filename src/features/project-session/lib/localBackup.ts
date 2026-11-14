/**
 * Локальная копия проекта (localStorage): защита от потери правок при обрыве связи,
 * закрытии вкладки или ошибке сервера. Копия помечается «не синхронизирована»,
 * пока сервер не подтвердит сохранение.
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
}

const backupSchema = z.object({
  roomData: z.unknown(),
  camera: cameraPoseSchema.nullable(),
  savedAt: z.string().max(40),
  synced: z.boolean(),
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

/** Есть ли копия, которую сервер ещё не подтвердил (правки только на этом устройстве). */
export function hasUnsyncedBackup(projectId: string): boolean {
  const backup = readBackup(projectId);
  return backup !== null && !backup.synced;
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
 * Нужно ли открыть локальную копию вместо серверной версии:
 * копия не синхронизирована и новее последнего изменения на сервере.
 */
export function shouldPreferBackup(backup: LocalBackup | null, serverUpdatedAt: string | undefined): boolean {
  if (!backup || backup.synced) return false;
  if (!serverUpdatedAt) return true;
  return Date.parse(backup.savedAt) > Date.parse(serverUpdatedAt);
}
