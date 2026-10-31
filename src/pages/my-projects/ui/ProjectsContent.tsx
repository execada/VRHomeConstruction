/**
 * Содержимое вкладок «Все» и «Избранное»: загрузка, ошибка, пустые состояния и доска.
 * @module pages/my-projects/ui/ProjectsContent
 */

import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CreateProjectFeature } from '@/features/create-project';
import { ProjectBoard, visibleProjects } from '@/widgets/project-board';
import { Button, type ViewMode } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state/EmptyState';
import { IsometricRoom } from '@/shared/ui/illustrations/IsometricRoom';
import { CardSkeletonGrid } from '@/shared/ui/skeleton/CardSkeleton';

interface ProjectsContentProps {
  favoritesOnly: boolean;
  query: string;
  view: ViewMode;
  onCreate: () => void;
}

export const ProjectsContent: React.FC<ProjectsContentProps> = ({ favoritesOnly, query, view, onCreate }) => {
  const dispatch = useDispatch();
  const projects = useSelector(CreateProjectFeature.selectors.selectProjects);
  const status = useSelector(CreateProjectFeature.selectors.selectProjectsStatus);
  const shown = useMemo(() => visibleProjects(projects, { favoritesOnly, query }), [projects, favoritesOnly, query]);

  if (projects.length === 0 && (status === 'loading' || status === 'idle')) return <CardSkeletonGrid />;
  if (projects.length === 0 && status === 'error') {
    return (
      <EmptyState
        title="Не удалось загрузить проекты"
        text="Проверьте подключение к интернету и попробуйте ещё раз."
        actions={<Button onClick={() => dispatch(CreateProjectFeature.actions.loadProjectsRequested())}>Повторить</Button>}
      />
    );
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        illustration={<IsometricRoom />}
        title="Создайте первый проект"
        text="Начните с пустой комнаты или готового макета — гостиной, спальни, кухни или студии."
        actions={
          <Button variant="primary" icon="plus" onClick={onCreate}>
            Новый проект
          </Button>
        }
      />
    );
  }
  if (shown.length === 0) {
    return query.trim() ? (
      <EmptyState title="Ничего не найдено" text={`По запросу «${query.trim()}» проектов нет. Попробуйте другое название или тег.`} />
    ) : (
      <EmptyState title="В избранном пока пусто" text="Отмечайте проекты звёздочкой на карточке — они появятся здесь." />
    );
  }
  return <ProjectBoard projects={shown} view={view} />;
};
