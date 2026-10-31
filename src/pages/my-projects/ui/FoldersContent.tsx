/**
 * Вкладка «Папки»: список папок или содержимое открытой папки.
 * @module pages/my-projects/ui/FoldersContent
 */

import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CreateProjectFeature } from '@/features/create-project';
import type { Project } from '@/features/create-project/types';
import { foldersSelectors } from '@/features/folders';
import type { Folder } from '@/features/folders/types';
import { ModalsFeature } from '@/features/modals';
import { FolderBoard } from '@/widgets/folder-board';
import { ProjectBoard, visibleProjects } from '@/widgets/project-board';
import { matchesQuery } from '@/shared/lib/search';
import { Button, type ViewMode } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state/EmptyState';
import { Icon } from '@/shared/ui/icon/Icon';
import styles from './myProjectsPage.module.scss';

interface FoldersContentProps {
  folderId: string | null;
  query: string;
  view: ViewMode;
  onOpenFolder: (folderId: string | null) => void;
}

const FolderView: React.FC<{ folder: Folder; query: string; view: ViewMode; onBack: () => void }> = ({ folder, query, view, onBack }) => {
  const projects = useSelector(CreateProjectFeature.selectors.selectProjects);
  const inFolder = useMemo(() => {
    const ids = new Set(folder.projectIds);
    return visibleProjects(projects.filter((p: Project) => ids.has(p.id)), { favoritesOnly: false, query });
  }, [projects, folder.projectIds, query]);

  return (
    <div className={styles.folderView}>
      <nav className={styles.breadcrumbs} aria-label="Навигация по папкам">
        <button type="button" className={styles.crumb} onClick={onBack}>
          <Icon name="chevronLeft" size={16} /> Все папки
        </button>
        <span className={styles.crumbCurrent}>{folder.name}</span>
      </nav>
      {inFolder.length > 0 ? (
        <ProjectBoard projects={inFolder} view={view} />
      ) : (
        <EmptyState
          title={query.trim() ? 'Ничего не найдено' : 'В папке пока нет проектов'}
          text={query.trim() ? undefined : 'Добавьте проект через меню «⋯» на карточке → «В папку…».'}
        />
      )}
    </div>
  );
};

export const FoldersContent: React.FC<FoldersContentProps> = ({ folderId, query, view, onOpenFolder }) => {
  const dispatch = useDispatch();
  const folders = useSelector(foldersSelectors.selectFolders);
  const shown = useMemo(() => folders.filter((f) => matchesQuery([f.name, f.description], query)), [folders, query]);
  const openFolder = useMemo(() => folders.find((f) => f.id === folderId), [folders, folderId]);

  if (openFolder) return <FolderView folder={openFolder} query={query} view={view} onBack={() => onOpenFolder(null)} />;
  if (folders.length === 0) {
    return (
      <EmptyState
        title="Папок пока нет"
        text="Группируйте проекты по объектам или клиентам: один проект может лежать в нескольких папках."
        actions={
          <Button variant="primary" icon="plus" onClick={() => dispatch(ModalsFeature.actions.openCreateFolderModal())}>
            Новая папка
          </Button>
        }
      />
    );
  }
  if (shown.length === 0) return <EmptyState title="Ничего не найдено" text={`Папок по запросу «${query.trim()}» нет.`} />;
  return <FolderBoard folders={shown} view={view} onOpen={(folder) => onOpenFolder(folder.id)} />;
};
