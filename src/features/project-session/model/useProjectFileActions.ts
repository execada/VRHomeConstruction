/**
 * Действия с проектом из меню редактора: экспорт и импорт файла, скриншот,
 * сохранение текущей комнаты как шаблона.
 * @module project-session/model/useProjectFileActions
 */

import { useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { layoutsApi } from '@/app/api';
import { isSessionEnded } from '@/app/api/errors';
import type { RootState } from '@/app/store';
import { cameraSession } from '@/features/camera/model/cameraSession';
import { CreateLayoutFeature } from '@/features/create-layout';
import { parseSceneDocument } from '@/features/editor-3d/lib/scene/parse';
import { sceneBridge } from '@/features/editor-3d/model/sceneBridge';
import { sceneLoadActions } from '@/features/editor-3d/sceneActions';
import { selectSceneDocument } from '@/features/editor-3d/sceneSelectors';
import { NotificationsFeature } from '@/features/notifications';
import { buildProjectFile, dataUrlToBlob, downloadBlob, downloadProjectFile, readProjectFile, safeFileName } from '@/shared/lib/projectFile';
import { toast } from '@/shared/lib/toast';

/** Название открытого проекта. */
function projectName(state: RootState): string {
  const id = state.projectSession.projectId;
  return state.createProject.projects.find((p) => p.id === id)?.name ?? 'Проект';
}

export function useProjectFileActions() {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  const exportFile = useCallback(() => {
    const state = store.getState();
    const camera = cameraSession.getState().pose;
    downloadProjectFile(buildProjectFile(projectName(state), { ...selectSceneDocument(state), camera }));
    toast.success('Проект сохранён в файл');
  }, [store]);

  const importFile = useCallback(
    async (file: File) => {
      try {
        const parsed = parseSceneDocument((await readProjectFile(file)).roomData);
        if (!parsed.ok) throw new Error(parsed.error);
        sceneLoadActions(parsed.doc).forEach((a) => dispatch(a));
        toast.success(parsed.dropped ? `Файл загружен, пропущено объектов: ${parsed.dropped}` : 'Сцена загружена из файла');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл');
      }
    },
    [dispatch],
  );

  const screenshot = useCallback(() => {
    const url = sceneBridge.capture(2048);
    if (!url) {
      toast.error('Скриншот доступен в 3D-режиме');
      return;
    }
    downloadBlob(dataUrlToBlob(url), safeFileName(projectName(store.getState()), '.jpg'));
  }, [store]);

  const saveAsTemplate = useCallback(async () => {
    const state = store.getState();
    const name = `${projectName(state)} — шаблон`.slice(0, 120);
    try {
      const layout = await layoutsApi.createLayout({
        name,
        description: 'Сохранено из редактора',
        roomData: selectSceneDocument(state),
        thumbnail: sceneBridge.capture(480) ?? undefined,
      });
      dispatch(CreateLayoutFeature.actions.upsertLayout(layout));
      dispatch(NotificationsFeature.actions.pushNotification({ kind: 'success', title: 'Шаблон создан', message: name }));
      toast.success('Комната сохранена как шаблон');
    } catch (error) {
      // Конец сессии: выход и сообщение о нём — общие.
      if (isSessionEnded(error)) return;
      console.error('Не удалось сохранить шаблон', error);
      toast.error('Не удалось сохранить шаблон');
    }
  }, [dispatch, store]);

  return { exportFile, importFile, screenshot, saveAsTemplate };
}
