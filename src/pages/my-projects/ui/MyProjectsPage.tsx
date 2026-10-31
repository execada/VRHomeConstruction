/**
 * Главная «Мои проекты» (Figma): вкладки Все / Избранное / Папки, кнопка «+»,
 * поиск, плитка или список. Без входа — приглашение войти.
 * @module pages/my-projects/ui/MyProjectsPage
 */

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cn from 'classnames';
import { ModalsFeature } from '@/features/modals';
import { UserFeature } from '@/features/user';
import { TemplatePicker } from '@/widgets/template-picker';
import { useStoredState } from '@/shared/lib/useStoredState';
import { Button, SearchField, ViewToggle, viewModeSchema } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state/EmptyState';
import { Icon } from '@/shared/ui/icon/Icon';
import { IsometricRoom } from '@/shared/ui/illustrations/IsometricRoom';
import { CardSkeletonGrid } from '@/shared/ui/skeleton/CardSkeleton';
import { useBoardParams, type BoardTab } from '../model/useBoardParams';
import { FoldersContent } from './FoldersContent';
import { ProjectsContent } from './ProjectsContent';
import styles from './myProjectsPage.module.scss';

const TABS: Array<{ id: BoardTab; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'favorites', label: 'Избранное' },
  { id: 'folders', label: 'Папки' },
];

const GuestState: React.FC = () => {
  const dispatch = useDispatch();
  return (
    <EmptyState
      illustration={<IsometricRoom furnished />}
      title="Проектируйте интерьер в 3D и VR"
      text="Расставляйте мебель, подбирайте отделку и свет, а затем пройдитесь по комнате в VR-шлеме. Войдите, чтобы проекты сохранялись в облаке."
      actions={
        <>
          <Button variant="primary" onClick={() => dispatch(UserFeature.actions.openAuthModal('register'))}>
            Создать аккаунт
          </Button>
          <Button onClick={() => dispatch(UserFeature.actions.openAuthModal('login'))}>Войти</Button>
        </>
      }
    />
  );
};

export const MyProjectsPage: React.FC = () => {
  const dispatch = useDispatch();
  const isAuth = useSelector(UserFeature.selectors.selectUserIsAuth);
  const restoring = useSelector(UserFeature.selectors.selectUserIsLoading);
  const { tab, folderId, setTab, openFolder } = useBoardParams();
  const [query, setQuery] = useState('');
  const [view, setView] = useStoredState('board-view', viewModeSchema, 'grid');
  const [pickerOpen, setPickerOpen] = useState(false);

  const onAdd = () => (tab === 'folders' ? dispatch(ModalsFeature.actions.openCreateFolderModal()) : setPickerOpen(true));

  const content = () => {
    if (!isAuth) return restoring ? <CardSkeletonGrid /> : <GuestState />;
    if (tab === 'folders') return <FoldersContent folderId={folderId} query={query} view={view} onOpenFolder={openFolder} />;
    return <ProjectsContent favoritesOnly={tab === 'favorites'} query={query} view={view} onCreate={() => setPickerOpen(true)} />;
  };

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Мои проекты</h1>
      <div className={styles.tabsRow}>
        <div className={styles.tabs} role="tablist" aria-label="Разделы">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={cn(styles.tab, tab === t.id && styles.tabActive)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.add}
          onClick={onAdd}
          aria-label={tab === 'folders' ? 'Новая папка' : 'Новый проект'}
          title={tab === 'folders' ? 'Новая папка' : 'Новый проект'}
        >
          <Icon name="plus" size={22} strokeWidth={2.2} />
        </button>
      </div>
      <div className={styles.toolbar}>
        <SearchField value={query} onChange={setQuery} placeholder={tab === 'folders' ? 'Поиск папок' : 'Поиск'} />
        <ViewToggle value={view} onChange={setView} />
      </div>
      <div className={styles.content}>{content()}</div>
      {pickerOpen && <TemplatePicker onClose={() => setPickerOpen(false)} />}
    </section>
  );
};
