/**
 * Карточка папки: мозаика превью проектов внутри, название, число проектов, меню.
 * @module widgets/folder-board/ui/FolderCard
 */

import React, { memo } from 'react';
import cn from 'classnames';
import type { Project } from '@/features/create-project/types';
import type { Folder } from '@/features/folders/types';
import { pluralize } from '@/shared/lib/plural';
import { IconButton } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { Menu } from '@/shared/ui/overlay/Menu';
import styles from './folderBoard.module.scss';

/** Действия над папкой, доступные из карточки. */
export interface FolderCardActions {
  open: (folder: Folder) => void;
  rename: (folder: Folder) => void;
  remove: (folder: Folder) => void;
}

const PROJECT_FORMS = ['проект', 'проекта', 'проектов'] as const;

const Mosaic: React.FC<{ projects: Project[] }> = ({ projects }) => {
  const thumbnails = projects.map((p) => p.thumbnail).filter(Boolean).slice(0, 4);
  if (thumbnails.length === 0) return <Icon name="folder" size={44} strokeWidth={1.4} className={styles.folderIcon} />;
  return (
    <span className={styles.mosaic} data-count={thumbnails.length}>
      {thumbnails.map((src, index) => (
        // Превью копий проекта совпадают, поэтому ключ — позиция в мозаике.
        <img key={index} src={src} alt="" loading="lazy" decoding="async" />
      ))}
    </span>
  );
};

interface FolderCardProps {
  folder: Folder;
  projects: Project[];
  actions: FolderCardActions;
  view: 'grid' | 'list';
}

export const FolderCard: React.FC<FolderCardProps> = memo(({ folder, projects, actions, view }) => (
  <article className={cn(styles.card, view === 'list' && styles.cardList)}>
    <button type="button" className={styles.preview} onClick={() => actions.open(folder)} aria-label={`Открыть папку «${folder.name}»`}>
      <Mosaic projects={projects} />
    </button>
    <div className={styles.info}>
      <div className={styles.text}>
        <h3 className={styles.name} title={folder.name}>
          {folder.name}
        </h3>
        <p className={styles.subtitle}>{folder.description || pluralize(projects.length, PROJECT_FORMS)}</p>
      </div>
      <div className={styles.actions}>
        <IconButton icon="pencil" label="Переименовать папку" size="sm" onClick={() => actions.rename(folder)} />
        <Menu
          trigger={(props) => <IconButton icon="more" label="Действия с папкой" size="sm" {...props} />}
          items={[
            { label: 'Открыть', icon: 'folder', onSelect: () => actions.open(folder) },
            { label: 'Переименовать', icon: 'pencil', onSelect: () => actions.rename(folder) },
            { label: 'Удалить папку', icon: 'trash', danger: true, separated: true, onSelect: () => actions.remove(folder) },
          ]}
        />
      </div>
    </div>
  </article>
));
