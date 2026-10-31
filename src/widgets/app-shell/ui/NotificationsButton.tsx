/**
 * Колокольчик уведомлений со счётчиком непрочитанных и всплывающим списком.
 * При закрытии списка уведомления помечаются прочитанными.
 * @module widgets/app-shell/ui/NotificationsButton
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cn from 'classnames';
import { NotificationsFeature, type AppNotification } from '@/features/notifications';
import { formatRelativeTime } from '@/shared/lib/time';
import { IconButton } from '@/shared/ui/controls';
import { Icon, type IconName } from '@/shared/ui/icon/Icon';
import styles from './appShell.module.scss';

const KIND_ICON: Record<AppNotification['kind'], IconName> = { info: 'info', success: 'check', warning: 'warning' };
const KIND_CLASS: Record<AppNotification['kind'], string | undefined> = {
  info: undefined,
  success: styles.kindSuccess,
  warning: styles.kindWarning,
};

const NotificationRow: React.FC<{ item: AppNotification; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => (
  <li className={cn(styles.notification, !item.read && styles.notificationUnread)}>
    <span className={cn(styles.notificationIcon, KIND_CLASS[item.kind])}>
      <Icon name={KIND_ICON[item.kind]} size={16} />
    </span>
    <div className={styles.notificationBody}>
      <div className={styles.notificationTitle}>{item.title}</div>
      {item.message && <div className={styles.notificationMessage}>{item.message}</div>}
      <time className={styles.notificationTime} dateTime={item.createdAt}>
        {formatRelativeTime(item.createdAt)}
      </time>
    </div>
    <IconButton icon="close" label="Убрать уведомление" size="sm" onClick={() => onDismiss(item.id)} />
  </li>
);

/** Закрытие по клику вне элемента и по Esc. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}

export const NotificationsButton: React.FC = () => {
  const dispatch = useDispatch();
  const items = useSelector(NotificationsFeature.selectors.selectNotifications);
  const unread = useSelector(NotificationsFeature.selectors.selectUnreadCount);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    dispatch(NotificationsFeature.actions.markAllRead());
  }, [dispatch]);
  useDismiss(open, ref, close);

  const dismiss = useCallback((id: string) => dispatch(NotificationsFeature.actions.dismissNotification(id)), [dispatch]);

  return (
    <div className={styles.popoverWrap} ref={ref}>
      <IconButton
        icon="bell"
        label={unread > 0 ? `Уведомления: ${unread} новых` : 'Уведомления'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      />
      {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Уведомления">
          <header className={styles.popoverHeader}>
            <span>Уведомления</span>
            {items.length > 0 && (
              <button type="button" className={styles.linkButton} onClick={() => dispatch(NotificationsFeature.actions.clearNotifications())}>
                Очистить
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <p className={styles.popoverEmpty}>Пока нет уведомлений</p>
          ) : (
            <ul className={styles.notificationList}>
              {items.map((item) => (
                <NotificationRow key={item.id} item={item} onDismiss={dismiss} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
