/**
 * Шапка приложения (Figma): логотип-дом, название и слоган, уведомления, профиль.
 * @module widgets/app-shell/ui/AppHeader
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { UserFeature } from '@/features/user';
import { Avatar } from '@/shared/ui/avatar/Avatar';
import { Button } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { NotificationsButton } from './NotificationsButton';
import styles from './appShell.module.scss';

export const AppHeader: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const dispatch = useDispatch();
  const isAuth = useSelector(UserFeature.selectors.selectUserIsAuth);
  const name = useSelector(UserFeature.selectors.selectUserName);

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="VR Home constructor — на главную">
        <Icon name="home" size={32} strokeWidth={1.6} className={styles.brandLogo} />
        <span className={styles.brandText}>
          <span className={styles.brandName}>VR Home constructor</span>
          <span className={styles.brandTagline}>Проектируй. Визуализируй. Живи.</span>
        </span>
      </Link>
      <div className={styles.headerActions}>
        <NotificationsButton />
        {isAuth ? (
          <button type="button" className={styles.avatarButton} onClick={onOpenSettings} aria-label="Профиль и настройки" title={name}>
            <Avatar name={name} size={36} />
          </button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => dispatch(UserFeature.actions.openAuthModal('login'))}>
            Войти
          </Button>
        )}
      </div>
    </header>
  );
};
