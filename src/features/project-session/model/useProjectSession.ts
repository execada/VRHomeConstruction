/**
 * Хук жизненного цикла проекта на странице редактора: открыть при входе,
 * сохранить и очистить при выходе, не потерять правки при закрытии вкладки.
 * @module project-session/model/useProjectSession
 */

import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import { cameraSession } from '@/features/camera/model/cameraSession';
import { selectSceneDocument } from '@/features/editor-3d/sceneSelectors';
import { writeBackup } from '../lib/localBackup';
import { actions } from '../slice';

/**
 * @param projectId - id проекта из адреса страницы
 */
export function useProjectSession(projectId: string | undefined): void {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  useEffect(() => {
    if (!projectId) return undefined;
    dispatch(actions.openRequested(projectId));
    return () => {
      dispatch(actions.closeRequested());
    };
  }, [projectId, dispatch]);

  // Закрытие вкладки: синхронно пишем локальную копию — при следующем открытии
  // несохранённые правки будут восстановлены и отправлены на сервер.
  useEffect(() => {
    const onUnload = () => {
      const state = store.getState();
      const session = state.projectSession;
      if (!session.projectId || session.status !== 'ready' || session.saveState === 'saved') return;
      writeBackup(session.projectId, {
        roomData: selectSceneDocument(state),
        camera: cameraSession.getState().pose,
        savedAt: new Date().toISOString(),
        synced: false,
      });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [store]);
}
