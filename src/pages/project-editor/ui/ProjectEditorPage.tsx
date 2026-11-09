/**
 * Страница редактора проекта: открывает проект по id из адреса, показывает
 * загрузку/ошибку или просьбу войти, затем рабочее пространство. Сохранение — автоматическое.
 * @module pages/project-editor/ui/ProjectEditorPage
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { ProjectSessionFeature } from '@/features/project-session';
import { useProjectSession } from '@/features/project-session/model/useProjectSession';
import { PageLoader } from '@/shared/ui/loader/PageLoader';
import { EditorWorkspace } from './EditorWorkspace';
import { SignInRequired } from './SignInRequired';
import styles from './ProjectEditorPage.module.scss';

export const ProjectEditorPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  useProjectSession(projectId);
  const status = useSelector(ProjectSessionFeature.selectors.selectSessionStatus);
  const error = useSelector(ProjectSessionFeature.selectors.selectSessionError);

  if (status === 'error') {
    return (
      <div className={styles.state} role="alert">
        <span className={styles.stateTitle}>Не удалось открыть проект</span>
        <span>{error}</span>
        <Link to="/">Вернуться к проектам</Link>
      </div>
    );
  }

  if (status === 'signedOut') return <SignInRequired />;

  if (status !== 'ready') return <PageLoader label="Загружаем проект…" />;

  return <EditorWorkspace />;
};
