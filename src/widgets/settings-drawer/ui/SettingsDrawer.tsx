/**
 * Панель настроек (Figma): профиль (имя, почта), тема оформления, выход.
 * Без входа доступна только тема и кнопка входа.
 * @module widgets/settings-drawer/ui/SettingsDrawer
 */

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ThemeFeature, type ThemeMode } from '@/features/theme';
import { ChangeEmailDialog, ChangeNameDialog, UserFeature } from '@/features/user';
import { Avatar } from '@/shared/ui/avatar/Avatar';
import { Button } from '@/shared/ui/controls';
import { Drawer } from '@/shared/ui/overlay/Drawer';
import styles from './settingsDrawer.module.scss';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Как в системе' },
];

const ProfileField: React.FC<{ label: string; value: string; action: string; onAction: () => void }> = ({ label, value, action, onAction }) => (
  <div className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    <span className={styles.fieldValue}>{value}</span>
    <button type="button" className={styles.fieldAction} onClick={onAction}>
      {action}
    </button>
  </div>
);

const ProfileInfo: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    <span className={styles.fieldValue}>{value}</span>
  </div>
);

const ThemeSelect: React.FC = () => {
  const dispatch = useDispatch();
  const mode = useSelector(ThemeFeature.selectors.selectThemeMode);
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Тема</span>
      <select className={styles.select} value={mode} onChange={(e) => dispatch(ThemeFeature.actions.setThemeMode(e.target.value as ThemeMode))}>
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export const SettingsDrawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useDispatch();
  const isAuth = useSelector(UserFeature.selectors.selectUserIsAuth);
  const name = useSelector(UserFeature.selectors.selectUserName) ?? '';
  const email = useSelector(UserFeature.selectors.selectUserEmail) ?? '';
  const username = useSelector(UserFeature.selectors.selectUserUsername);
  const isAdmin = useSelector(UserFeature.selectors.selectUserIsAdmin);
  const [dialog, setDialog] = useState<'name' | 'email' | null>(null);
  const closeDialog = () => setDialog(null);

  return (
    <Drawer label="Настройки" side="left" onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.profile}>
          <Avatar name={isAuth ? name || email || username : undefined} size={96} />
          {isAuth ? (
            <div className={styles.fields}>
              <ProfileField label="Имя" value={name || 'Без имени'} action="Сменить имя" onAction={() => setDialog('name')} />
              {username && <ProfileInfo label="Логин" value={isAdmin ? `${username} · администратор` : username} />}
              <ProfileField
                label="Почта"
                value={email || 'Не указана'}
                action={email ? 'Сменить почту' : 'Указать почту'}
                onAction={() => setDialog('email')}
              />
            </div>
          ) : (
            <div className={styles.fields}>
              <p className={styles.hint}>Войдите, чтобы сохранять проекты в облаке и управлять профилем.</p>
              <Button
                variant="primary"
                onClick={() => {
                  dispatch(UserFeature.actions.openAuthModal('login'));
                  onClose();
                }}
              >
                Войти
              </Button>
            </div>
          )}
        </div>
        <hr className={styles.divider} />
        <ThemeSelect />
        <div className={styles.footer}>
          {isAuth && (
            <Button
              variant="ghost"
              icon="logout"
              onClick={() => {
                dispatch(UserFeature.actions.logout());
                onClose();
              }}
            >
              Выйти из аккаунта
            </Button>
          )}
          <a className={styles.licenses} href="/assets/LICENSES.md" target="_blank" rel="noopener noreferrer">
            Лицензии 3D-моделей и текстур
          </a>
        </div>
      </div>
      {dialog === 'name' && <ChangeNameDialog currentName={name} onClose={closeDialog} />}
      {dialog === 'email' && <ChangeEmailDialog currentEmail={email} onClose={closeDialog} />}
    </Drawer>
  );
};
