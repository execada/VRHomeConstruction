/**
 * Рабочее пространство редактора: верхняя панель, инструменты слева, сцена (3D или 2D),
 * инспектор справа. Все режимы работают с одним состоянием — правки синхронны.
 * @module pages/project-editor/ui/EditorWorkspace
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { EditorOnboarding } from '@/features/editor-3d/ui/EditorOnboarding';
import { useEditorShortcuts } from '@/features/editor-3d/model/useEditorShortcuts';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { ProjectSessionFeature } from '@/features/project-session';
import { useVrStore } from '@/features/vr/model/useVrStore';
import { EditorInspector } from '@/widgets/editor-inspector';
import { EditorPanel } from '@/widgets/editor-panel';
import { EditorTopBar } from '@/widgets/editor-topbar';
import { PlanEditor2D } from '@/widgets/plan-editor-2d';
import { SceneViewport } from '@/widgets/scene-viewport';
import styles from './ProjectEditorPage.module.scss';

export const EditorWorkspace: React.FC = () => {
  const dispatch = useDispatch();
  const viewMode = useSelector(editorSelectors.selectViewMode);
  const xrStore = useVrStore();
  const save = useCallback(() => dispatch(ProjectSessionFeature.actions.saveNowRequested()), [dispatch]);
  useEditorShortcuts();


  return (
    <div className={styles.editor}>
      <EditorTopBar xrStore={xrStore} />
      <div className={styles.body}>
        <EditorPanel />
        {viewMode === '2d' ? <PlanEditor2D /> : <SceneViewport xrStore={xrStore} onSave={save} />}
        <EditorInspector />
      </div>
      <EditorOnboarding />
    </div>
  );
};
