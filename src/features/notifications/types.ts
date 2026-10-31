/**
 * Типы фичи уведомлений (колокольчик в шапке).
 * @module notifications/types
 */

/** Вид уведомления. */
export type NotificationKind = 'info' | 'success' | 'warning';

/** Уведомление приложения. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  /** ISO-время создания */
  createdAt: string;
  read: boolean;
}

/** Состояние уведомлений (Redux slice, сохраняется в localStorage). */
export interface NotificationsState {
  items: AppNotification[];
}
