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

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Записать копию (ошибка квоты не прерывает работу). */
export function writeBackup(projectId: string, backup: LocalBackup): void {
  try {
    storage()?.setItem(PREFIX + projectId, JSON.stringify(backup));
  } catch (error) {
    console.warn('Не удалось сохранить локальную копию проекта', error);
  }
}

/** Прочитать копию (null — нет или повреждена). */
export function readBackup(projectId: string): LocalBackup | null {
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

/** Удалить копию (проект удалён). */
export function removeBackup(projectId: string): void {
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
