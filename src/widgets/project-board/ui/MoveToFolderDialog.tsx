/**
 * Диалог «В папку»: отметить папки, в которых лежит проект (проект может быть в нескольких).
 * Изменения сохраняются сразу — сага папок отправляет их на сервер.
 * @module widgets/project-board/ui/MoveToFolderDialog
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Project } from '@/features/create-project/types';
import { foldersActions, foldersSelectors } from '@/features/folders';
import { ModalsFeature } from '@/features/modals';
import { Button } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import styles from './projectBoard.module.scss';

export const MoveToFolderDialog: React.FC<{ project: Project; onClose: () => void }> = ({ project, onClose }) => {
  const dispatch = useDispatch();
  const folders = useSelector(foldersSelectors.selectFolders);

  const toggle = (folderId: string, inFolder: boolean) => {
    const payload = { folderId, projectId: project.id };
    dispatch(inFolder ? foldersActions.removeProjectFromFolder(payload) : foldersActions.addProjectToFolder(payload));
  };

  const createFolder = () => {
    onClose();
    dispatch(ModalsFeature.actions.openCreateFolderModal());
  };

  return (
    <Dialog
      title={`«${project.name}» в папки`}
      onClose={onClose}
      actions={
        <>
          <Button icon="plus" onClick={createFolder}>
            Новая папка
          </Button>
          <Button variant="primary" onClick={onClose}>
            Готово
          </Button>
        </>
      }
    >
      {folders.length === 0 ? (
        <p className={styles.dialogEmpty}>Папок пока нет — создайте первую, чтобы группировать проекты.</p>
      ) : (
        <ul className={styles.folderList}>
          {folders.map((folder) => {
            const inFolder = folder.projectIds.includes(project.id);
            return (
              <li key={folder.id}>
                <label className={styles.folderOption}>
                  <input type="checkbox" checked={inFolder} onChange={() => toggle(folder.id, inFolder)} />
                  <Icon name="folder" size={18} />
                  <span className={styles.folderName}>{folder.name}</span>
                  <span className={styles.folderCount}>{folder.projectIds.length}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
};
