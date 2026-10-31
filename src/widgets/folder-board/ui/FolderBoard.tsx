/**
 * Вкладка «Папки»: плитка папок с превью проектов, переименование и удаление.
 * @module widgets/folder-board/ui/FolderBoard
 */

import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cn from 'classnames';
import { CreateProjectFeature } from '@/features/create-project';
import type { Project } from '@/features/create-project/types';
import { foldersActions } from '@/features/folders';
import type { Folder } from '@/features/folders/types';
import { ConfirmDialog } from '@/shared/ui/overlay/Dialog';
import { FolderCard, type FolderCardActions } from './FolderCard';
import { RenameFolderDialog } from './RenameFolderDialog';
import styles from './folderBoard.module.scss';

interface FolderBoardProps {
  folders: Folder[];
  view: 'grid' | 'list';
  onOpen: (folder: Folder) => void;
}

type PendingAction = { kind: 'rename' | 'remove'; folder: Folder } | null;

export const FolderBoard: React.FC<FolderBoardProps> = ({ folders, view, onOpen }) => {
  const dispatch = useDispatch();
  const projects = useSelector(CreateProjectFeature.selectors.selectProjects);
  const [pending, setPending] = useState<PendingAction>(null);
  const close = () => setPending(null);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const actions = useMemo<FolderCardActions>(
    () => ({
      open: onOpen,
      rename: (folder) => setPending({ kind: 'rename', folder }),
      remove: (folder) => setPending({ kind: 'remove', folder }),
    }),
    [onOpen],
  );

  const projectsOf = (folder: Folder): Project[] => folder.projectIds.map((id) => byId.get(id)).filter((p): p is Project => Boolean(p));

  return (
    <>
      <div className={cn(styles.grid, view === 'list' && styles.list)}>
        {folders.map((folder) => (
          <FolderCard key={folder.id} folder={folder} projects={projectsOf(folder)} actions={actions} view={view} />
        ))}
      </div>
      {pending?.kind === 'rename' && <RenameFolderDialog folder={pending.folder} onClose={close} />}
      {pending?.kind === 'remove' && (
        <ConfirmDialog
          title="Удалить папку?"
          message={`Папка «${pending.folder.name}» будет удалена. Проекты из неё останутся во вкладке «Все».`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            dispatch(foldersActions.removeFolder(pending.folder.id));
            close();
          }}
          onCancel={close}
        />
      )}
    </>
  );
};
