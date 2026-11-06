/**
 * Верхняя панель редактора: назад, название, статус сохранения, отмена/повтор,
 * 2D/3D, режим камеры (облёт, от лица, план, улица), вход в VR и меню проекта.
 * @module widgets/editor-topbar/ui/EditorTopBar
 */

import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CameraFeature, type CameraMode } from '@/features/camera';
import { HistoryFeature } from '@/features/history';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { useProjectFileActions } from '@/features/project-session/model/useProjectFileActions';
import type { VrStore } from '@/features/vr/lib/createVrStore';
import { useVrSupport } from '@/features/vr/model/useVrSupport';
import { toast } from '@/shared/lib/toast';
import { Button, IconButton, Segmented } from '@/shared/ui/controls';
import { Menu } from '@/shared/ui/overlay/Menu';
import { ProjectTitle } from './ProjectTitle';
import { SaveStatus } from './SaveStatus';
import { VrHelpDialog } from './VrHelpDialog';
import styles from './EditorTopBar.module.scss';

const VR_FROM_2D_DELAY_MS = 200;

const CAMERA_OPTIONS: Array<{ value: CameraMode; label: string; icon: 'orbit' | 'walk' | 'plan' | 'building' }> = [
  { value: 'orbit', label: 'Облёт', icon: 'orbit' },
  { value: 'fps', label: 'От лица', icon: 'walk' },
  { value: 'top', label: 'План', icon: 'plan' },
  { value: 'street', label: 'Улица', icon: 'building' },
];

export const EditorTopBar: React.FC<{ xrStore: VrStore }> = ({ xrStore }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const viewMode = useSelector(editorSelectors.selectViewMode);
  const cameraMode = useSelector(CameraFeature.selectors.selectCameraMode);
  const canUndo = useSelector(HistoryFeature.selectors.selectCanUndo);
  const canRedo = useSelector(HistoryFeature.selectors.selectCanRedo);
  const vrSupported = useVrSupport();
  const files = useProjectFileActions();
  const [vrHelp, setVrHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const enterVr = () => {
    if (!vrSupported) {
      setVrHelp(true);
      return;
    }
    const start = () =>
      xrStore.enterVR().catch((error) => {
        console.error('Не удалось запустить VR', error);
        toast.error('Не удалось запустить VR-сессию');
      });
    if (viewMode !== '2d') {
      start();
      return;
    }
    // Из 2D: сначала смонтировать 3D-сцену; активация от клика пользователя ещё действует.
    dispatch(editorActions.setViewMode('3d'));
    window.setTimeout(start, VR_FROM_2D_DELAY_MS);
  };

  return (
    <header className={styles.bar}>
      <IconButton icon="chevronLeft" label="К проектам" onClick={() => navigate('/')} />
      <ProjectTitle />
      <SaveStatus />
      <div className={styles.group}>
        <IconButton icon="undo" label="Отменить (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch(HistoryFeature.actions.undoRequested())} />
        <IconButton icon="redo" label="Повторить (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => dispatch(HistoryFeature.actions.redoRequested())} />
      </div>
      <span className={styles.spacer} />
      <Segmented
        ariaLabel="Режим редактора"
        options={[
          { value: '2d', label: '2D' },
          { value: '3d', label: '3D' },
        ]}
        value={viewMode === '2d' ? '2d' : '3d'}
        onChange={(mode) => dispatch(editorActions.setViewMode(mode))}
      />
      {viewMode !== '2d' && (
        <Segmented
          className={styles.hideNarrow}
          ariaLabel="Камера"
          options={CAMERA_OPTIONS}
          value={cameraMode === 'fixed' ? 'orbit' : cameraMode}
          onChange={(mode) => dispatch(CameraFeature.actions.setMode(mode))}
        />
      )}
      <Button variant="primary" icon="vr" className={styles.vr} onClick={enterVr} title={vrSupported ? 'Войти в VR' : 'Как открыть в VR'}>
        VR
      </Button>
      <Menu
        trigger={(props) => <IconButton icon="more" label="Меню проекта" {...props} />}
        items={[
          { label: 'Сохранить в файл', icon: 'download', onSelect: files.exportFile },
          { label: 'Открыть из файла…', icon: 'upload', onSelect: () => fileInput.current?.click() },
          { label: 'Скриншот', icon: 'camera', onSelect: files.screenshot },
          { label: 'Сохранить как шаблон', icon: 'layers', onSelect: files.saveAsTemplate, separated: true },
          { label: 'Как открыть в VR', icon: 'help', onSelect: () => setVrHelp(true) },
        ]}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void files.importFile(file);
        }}
      />
      {vrHelp && <VrHelpDialog onClose={() => setVrHelp(false)} />}
    </header>
  );
};
