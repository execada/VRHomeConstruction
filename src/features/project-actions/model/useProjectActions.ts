/**
 * Действия с проектами на главной: создание (пустой, из шаблона, из файла),
 * избранное, изменение названия/описания/тегов, дублирование, удаление.
 * Ошибки показываются пользователю понятным текстом, детали — в консоли.
 * @module project-actions/model/useProjectActions
 */

import { useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { layoutsApi, projectsApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import type { RootState } from '@/app/store';
import { CreateProjectFeature } from '@/features/create-project';
import type { Project } from '@/features/create-project/types';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import { parseSceneDocument } from '@/features/editor-3d/lib/scene/parse';
import { foldersActions } from '@/features/folders';
import { NotificationsFeature } from '@/features/notifications';
import { removeBackup } from '@/features/project-session/lib/localBackup';
import { findBuiltinTemplate } from '@/features/templates/lib/builtins';
import { UserFeature } from '@/features/user';
import { readProjectFile } from '@/shared/lib/projectFile';
import { toast } from '@/shared/lib/toast';

/** Имя нового проекта: «Проект N». */
function nextProjectName(projects: Project[], base = 'Проект'): string {
  const taken = new Set(projects.map((p) => p.name));
  let n = projects.length + 1;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function useProjectActions() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const store = useStore<RootState>();

  /** Создать проект и открыть редактор (без входа — предлагаем войти). */
  const create = useCallback(
    async (input: { name?: string; roomData: unknown; template?: string; description?: string }) => {
      if (!UserFeature.selectors.selectUserIsAuth(store.getState())) {
        dispatch(UserFeature.actions.openAuthModal('login'));
        toast.info('Войдите, чтобы сохранять проекты');
        return;
      }
      try {
        const project = await projectsApi.createProject({
          name: input.name ?? nextProjectName(store.getState().createProject.projects),
          roomData: input.roomData,
          template: input.template,
          description: input.description,
        });
        dispatch(CreateProjectFeature.actions.upsertProject(project));
        navigate(`/project/${project.id}`);
      } catch (error) {
        console.error('Не удалось создать проект', error);
        toast.error(apiErrorText(error, 'Не удалось создать проект'));
      }
    },
    [dispatch, navigate, store],
  );

  const createBlank = useCallback(() => create({ roomData: createEmptyScene() }), [create]);

  const createFromBuiltin = useCallback(
    async (templateId: string) => {
      const template = findBuiltinTemplate(templateId);
      if (!template) {
        toast.error('Шаблон не найден');
        return;
      }
      await create({ name: template.name, roomData: template.build(), template: template.id, description: template.description });
    },
    [create],
  );

  const createFromLayout = useCallback(
    async (layoutId: string) => {
      try {
        const layout = await layoutsApi.fetchLayout(layoutId);
        const parsed = parseSceneDocument(layout.roomData ?? createEmptyScene());
        if (!parsed.ok) {
          // Повреждённый шаблон не подменяем молча пустой комнатой — пользователь должен знать.
          toast.error(`Шаблон «${layout.name}» повреждён: ${parsed.error}`);
          return;
        }
        await create({ name: layout.name, roomData: parsed.doc, description: layout.description });
      } catch (error) {
        console.error('Не удалось открыть шаблон', error);
        toast.error(apiErrorText(error, 'Не удалось открыть шаблон'));
      }
    },
    [create],
  );

  const importFile = useCallback(
    async (file: File) => {
      try {
        const projectFile = await readProjectFile(file);
        const parsed = parseSceneDocument(projectFile.roomData);
        if (!parsed.ok) throw new Error(parsed.error);
        await create({ name: projectFile.name.slice(0, 120), roomData: parsed.doc });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл');
      }
    },
    [create],
  );

  const patch = useCallback(
    async (id: string, changes: Parameters<typeof projectsApi.patchProject>[1], failure: string) => {
      try {
        dispatch(CreateProjectFeature.actions.upsertProject(await projectsApi.patchProject(id, changes)));
        return true;
      } catch (error) {
        console.error(failure, error);
        toast.error(apiErrorText(error, failure));
        return false;
      }
    },
    [dispatch],
  );

  /** Избранное меняется сразу (оптимистично) и откатывается, если сервер не принял изменение. */
  const toggleFavorite = useCallback(
    async (project: Project) => {
      const before = Boolean(project.favorite);
      dispatch(CreateProjectFeature.actions.upsertProject({ ...project, favorite: !before }));
      const saved = await patch(project.id, { favorite: !before }, 'Не удалось изменить избранное');
      // Откат — явным значением: слияние в upsertProject не умеет «вернуть» отсутствующее поле.
      if (!saved) dispatch(CreateProjectFeature.actions.upsertProject({ ...project, favorite: before }));
    },
    [dispatch, patch],
  );

  const updateMeta = useCallback(
    (id: string, meta: { name: string; description: string; tags: string[] }) => patch(id, meta, 'Не удалось сохранить изменения'),
    [patch],
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        dispatch(CreateProjectFeature.actions.upsertProject(await projectsApi.duplicateProject(id)));
        toast.success('Копия проекта создана');
      } catch (error) {
        console.error('Не удалось дублировать проект', error);
        toast.error(apiErrorText(error, 'Не удалось дублировать проект'));
      }
    },
    [dispatch],
  );

  const remove = useCallback(
    async (project: Project) => {
      try {
        await projectsApi.deleteProject(project.id);
        dispatch(CreateProjectFeature.actions.removeProjectLocal(project.id));
        store
          .getState()
          .folders.folders.filter((f) => f.projectIds.includes(project.id))
          .forEach((f) => dispatch(foldersActions.removeProjectFromFolder({ folderId: f.id, projectId: project.id })));
        removeBackup(project.id);
        dispatch(NotificationsFeature.actions.pushNotification({ kind: 'info', title: 'Проект удалён', message: project.name }));
      } catch (error) {
        console.error('Не удалось удалить проект', error);
        toast.error(apiErrorText(error, 'Не удалось удалить проект'));
      }
    },
    [dispatch, store],
  );

  return { createBlank, createFromBuiltin, createFromLayout, importFile, toggleFavorite, updateMeta, duplicate, remove };
}
