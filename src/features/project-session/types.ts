/**
 * Типы сессии редактирования проекта (загрузка и автосохранение).
 * @module project-session/types
 */

/** Загрузка проекта; signedOut — без входа (сессия закончилась): после входа проект откроется снова. */
export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error' | 'signedOut';

/** Состояние сохранения: сохранено, есть изменения, сохраняется, ошибка, нет связи. */
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'offline';

export interface ProjectSessionState {
  projectId: string | null;
  status: SessionStatus;
  /** Текст ошибки загрузки для пользователя */
  error: string | null;
  saveState: SaveState;
  /** Время последнего успешного сохранения (ISO) */
  lastSavedAt: string | null;
  /** Открыта локальная копия (сервер недоступен или были несохранённые правки) */
  fromLocalBackup: boolean;
  /** Без входа: на устройстве осталась несохранённая на сервере копия проекта (вернётся после входа) */
  unsavedKept: boolean;
}
