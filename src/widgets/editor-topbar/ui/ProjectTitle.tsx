/**
 * Название проекта с переименованием на месте (Enter — сохранить, Esc — отмена).
 * @module widgets/editor-topbar/ui/ProjectTitle
 */

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { projectsApi } from '@/app/api';
import type { RootState } from '@/app/store';
import { CreateProjectFeature } from '@/features/create-project';
import { ProjectSessionFeature } from '@/features/project-session';
import { toast } from '@/shared/lib/toast';
import styles from './EditorTopBar.module.scss';

const MAX_NAME = 120;

export const ProjectTitle: React.FC = () => {
  const dispatch = useDispatch();
  const id = useSelector(ProjectSessionFeature.selectors.selectSessionProjectId);
  const project = useSelector((s: RootState) => CreateProjectFeature.selectors.selectProjects(s).find((p) => p.id === id));
  const [draft, setDraft] = useState<string | null>(null);

  const commit = async () => {
    const name = (draft ?? '').trim().slice(0, MAX_NAME);
    setDraft(null);
    if (!project || !name || name === project.name) return;
    try {
      dispatch(CreateProjectFeature.actions.upsertProject(await projectsApi.patchProject(project.id, { name })));
    } catch (error) {
      console.error('Не удалось переименовать проект', error);
      toast.error('Не удалось переименовать проект');
    }
  };

  if (draft !== null) {
    return (
      <input
        className={styles.nameInput}
        value={draft}
        maxLength={MAX_NAME}
        autoFocus
        aria-label="Название проекта"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    );
  }
  return (
    <button type="button" className={styles.name} title="Переименовать" onClick={() => setDraft(project?.name ?? '')}>
      {project?.name ?? 'Проект'}
    </button>
  );
};
