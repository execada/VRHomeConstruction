/**
 * Оболочка страниц вне редактора: боковая панель, шапка и контент страницы.
 * Здесь же — импорт проекта из файла и панель настроек.
 * @module widgets/app-shell/ui/AppShell
 */

import React, { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useProjectActions } from '@/features/project-actions';
import { UserFeature } from '@/features/user';
import { SettingsDrawer } from '@/widgets/settings-drawer';
import { AppHeader } from './AppHeader';
import { AppRail } from './AppRail';
import styles from './appShell.module.scss';

export const AppShell: React.FC = () => {
  const dispatch = useDispatch();
  const isAuth = useSelector(UserFeature.selectors.selectUserIsAuth);
  const { importFile } = useProjectActions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const startImport = useCallback(() => {
    if (isAuth) fileInput.current?.click();
    else dispatch(UserFeature.actions.openAuthModal('login'));
  }, [dispatch, isAuth]);

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void importFile(file);
  };

  return (
    <div className={styles.shell}>
      <AppRail onOpenSettings={openSettings} onImport={startImport} />
      <div className={styles.column}>
        <AppHeader onOpenSettings={openSettings} />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFileChosen} />
      {settingsOpen && <SettingsDrawer onClose={closeSettings} />}
    </div>
  );
};
