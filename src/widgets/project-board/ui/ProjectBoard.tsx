/**
 * Доска проектов: плитка или список карточек и диалоги действий
 * (изменение описания, перенос в папку, подтверждение удаления).
 * @module widgets/project-board/ui/ProjectBoard
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import type { Project } from '@/features/create-project/types';
import { useProjectActions } from '@/features/project-actions';
import { ConfirmDialog } from '@/shared/ui/overlay/Dialog';
import { EditProjectDialog } from './EditProjectDialog';
import { MoveToFolderDialog } from './MoveToFolderDialog';
import { ProjectCard, type ProjectCardActions } from './ProjectCard';
import styles from './projectBoard.module.scss';

type PendingAction = { kind: 'edit' | 'move' | 'remove'; project: Project } | null;

export const ProjectBoard: React.FC<{ projects: Project[]; view: 'grid' | 'list' }> = ({ projects, view }) => {
  const navigate = useNavigate();
  const { toggleFavorite, duplicate, updateMeta, remove } = useProjectActions();
  const [pending, setPending] = useState<PendingAction>(null);
  const close = () => setPending(null);

  const actions = useMemo<ProjectCardActions>(
    () => ({
      open: (project) => navigate(`/project/${project.id}`),
      toggleFavorite: (project) => void toggleFavorite(project),
      edit: (project) => setPending({ kind: 'edit', project }),
      duplicate: (project) => void duplicate(project.id),
      move: (project) => setPending({ kind: 'move', project }),
      remove: (project) => setPending({ kind: 'remove', project }),
    }),
    [navigate, toggleFavorite, duplicate],
  );

  return (
    <>
      <div className={cn(styles.grid, view === 'list' && styles.list)}>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} view={view} actions={actions} />
        ))}
      </div>
      {pending?.kind === 'edit' && (
        <EditProjectDialog project={pending.project} onSave={(meta) => updateMeta(pending.project.id, meta)} onClose={close} />
      )}
      {pending?.kind === 'move' && <MoveToFolderDialog project={pending.project} onClose={close} />}
      {pending?.kind === 'remove' && (
        <ConfirmDialog
          title="Удалить проект?"
          message={`Проект «${pending.project.name}» будет удалён вместе с расстановкой. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            void remove(pending.project);
            close();
          }}
          onCancel={close}
        />
      )}
    </>
  );
};
