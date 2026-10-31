/**
 * Карточка проекта (Figma): превью, звезда «Избранное», название, теги и описание,
 * карандаш — изменить описание, меню — дублировать, перенести в папку, удалить.
 * @module widgets/project-board/ui/ProjectCard
 */

import React, { memo } from 'react';
import cn from 'classnames';
import type { Project } from '@/features/create-project/types';
import { formatRelativeTime } from '@/shared/lib/time';
import { IconButton } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { IsometricRoom } from '@/shared/ui/illustrations/IsometricRoom';
import { Menu } from '@/shared/ui/overlay/Menu';
import { projectSubtitle } from '../lib/visibleProjects';
import styles from './projectBoard.module.scss';

/** Действия над проектом, доступные из карточки. */
export interface ProjectCardActions {
  open: (project: Project) => void;
  toggleFavorite: (project: Project) => void;
  edit: (project: Project) => void;
  duplicate: (project: Project) => void;
  move: (project: Project) => void;
  remove: (project: Project) => void;
}

interface ProjectCardProps {
  project: Project;
  view: 'grid' | 'list';
  actions: ProjectCardActions;
}

const ProjectMenu: React.FC<{ project: Project; actions: ProjectCardActions }> = ({ project, actions }) => (
  <Menu
    trigger={(props) => <IconButton icon="more" label="Действия с проектом" size="sm" {...props} />}
    items={[
      { label: 'Открыть', icon: 'expand', onSelect: () => actions.open(project) },
      { label: 'Изменить описание', icon: 'pencil', onSelect: () => actions.edit(project) },
      { label: 'Дублировать', icon: 'copy', onSelect: () => actions.duplicate(project) },
      { label: 'В папку…', icon: 'folder', onSelect: () => actions.move(project) },
      { label: 'Удалить', icon: 'trash', danger: true, separated: true, onSelect: () => actions.remove(project) },
    ]}
  />
);

export const ProjectCard: React.FC<ProjectCardProps> = memo(({ project, view, actions }) => {
  const subtitle = projectSubtitle(project);
  const edited = formatRelativeTime(project.updatedAt ?? project.createdAt);

  return (
    <article className={cn(styles.card, view === 'list' && styles.cardList)}>
      <div className={styles.thumb}>
        <button type="button" className={styles.thumbButton} onClick={() => actions.open(project)} aria-label={`Открыть проект «${project.name}»`}>
          {project.thumbnail ? (
            <img src={project.thumbnail} alt="" className={styles.thumbImage} loading="lazy" decoding="async" />
          ) : (
            <IsometricRoom className={styles.thumbIllustration} />
          )}
        </button>
        <button
          type="button"
          className={cn(styles.favorite, project.favorite && styles.favoriteOn)}
          onClick={() => actions.toggleFavorite(project)}
          aria-pressed={Boolean(project.favorite)}
          aria-label={project.favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          title={project.favorite ? 'Убрать из избранного' : 'В избранное'}
        >
          <Icon name="star" size={16} filled={project.favorite} />
        </button>
      </div>
      <div className={styles.info}>
        <div className={styles.text}>
          <h3 className={styles.name} title={project.name}>
            {project.name}
          </h3>
          <p className={styles.subtitle}>{subtitle || `Изменён ${edited}`}</p>
          {view === 'list' && subtitle && <p className={styles.meta}>Изменён {edited}</p>}
        </div>
        <div className={styles.cardActions}>
          <IconButton icon="pencil" label="Изменить название и описание" size="sm" onClick={() => actions.edit(project)} />
          <ProjectMenu project={project} actions={actions} />
        </div>
      </div>
    </article>
  );
});
