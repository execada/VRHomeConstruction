import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from '../App';
import { AppShell } from '@/widgets/app-shell';
import { MyProjectsPage } from '@/pages/my-projects';
import { TemplatesPage } from '@/pages/templates';
import { NotFoundPage } from '@/pages/not-found';
import { PageLoader } from '@/shared/ui/loader/PageLoader';

// Редактор (three.js, WebXR, модели) грузится отдельным чанком — главная открывается быстро.
const ProjectEditorPage = lazy(() => import('@/pages/project-editor').then((m) => ({ default: m.ProjectEditorPage })));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        // Страницы с боковой панелью и шапкой.
        element: <AppShell />,
        children: [
          { index: true, element: <MyProjectsPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // Редактор — на весь экран, со своей панелью.
      {
        path: 'project/:projectId',
        element: (
          <Suspense fallback={<PageLoader label="Открываем редактор…" />}>
            <ProjectEditorPage />
          </Suspense>
        ),
      },
      // Старые адреса до редизайна.
      { path: 'packages', element: <Navigate to="/?tab=folders" replace /> },
      { path: 'layouts', element: <Navigate to="/templates" replace /> },
    ],
  },
]);
