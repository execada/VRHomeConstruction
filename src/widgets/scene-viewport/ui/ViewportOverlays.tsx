/**
 * Элементы поверх 3D-сцены: панель инструментов, счётчик FPS и контекстная подсказка.
 * @module widgets/scene-viewport/ui/ViewportOverlays
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { CameraFeature } from '@/features/camera';
import { GraphicsFeature } from '@/features/graphics';
import { interaction, interactionStore } from '@/features/editor-3d/model/interactionStore';
import { sceneBridgeStore } from '@/features/editor-3d/model/sceneBridge';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import type { Tool } from '@/features/editor-3d/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { IconButton } from '@/shared/ui/controls';
import type { IconName } from '@/shared/ui/icon/Icon';
import styles from './SceneViewport.module.scss';

const TOOLS: Array<{ tool: Tool; icon: IconName; label: string }> = [
  { tool: 'select', icon: 'cursor', label: 'Выбор и перемещение (Esc)' },
  { tool: 'window', icon: 'window', label: 'Окно: кликните по стене' },
  { tool: 'door', icon: 'door', label: 'Дверь: кликните по стене' },
  { tool: 'partition', icon: 'partition', label: 'Перегородка: кликните по полу' },
];

/** Панель инструментов внизу сцены. */
export const ViewportToolbar: React.FC = () => {
  const dispatch = useDispatch();
  const tool = useSelector(editorSelectors.selectActiveTool);
  const grid = useExternalStore(interactionStore, (s) => s.gridEnabled);
  return (
    <div className={cn(styles.overlay, styles.toolbar)} role="toolbar" aria-label="Инструменты сцены">
      {TOOLS.map((t) => (
        <IconButton key={t.tool} icon={t.icon} label={t.label} active={tool === t.tool} onClick={() => dispatch(editorActions.setActiveTool(t.tool))} />
      ))}
      <span className={styles.divider} />
      <IconButton icon="grid" label="Привязка к сетке 10 см (G)" active={grid} onClick={interaction.toggleGrid} />
      <IconButton icon="rotate" label="Сбросить вид камеры" onClick={() => dispatch(CameraFeature.actions.resetView())} />
    </div>
  );
};

/** Счётчик кадров в секунду. */
export const FpsBadge: React.FC = () => {
  const show = useSelector(GraphicsFeature.selectors.selectShowFps);
  const fps = useExternalStore(sceneBridgeStore, (s) => s.fps);
  if (!show) return null;
  return <div className={cn(styles.overlay, styles.fps, fps > 0 && fps < 30 && styles.fpsLow)}>{fps} FPS</div>;
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className={styles.kbd}>{children}</kbd>;

/** Подсказка по текущему действию. */
export const ViewportHint: React.FC = () => {
  const mode = useExternalStore(interactionStore, (s) => s.mode);
  const placingName = useExternalStore(interactionStore, (s) => s.placingName);
  const tool = useSelector(editorSelectors.selectActiveTool);
  const camera = useSelector(CameraFeature.selectors.selectCameraMode);

  let content: React.ReactNode = null;
  if (mode === 'placing') {
    content = (
      <>
        «{placingName}»: кликните по полу, столу или полке, чтобы поставить · <Kbd>R</Kbd> поворот · <Kbd>Shift</Kbd>+клик — ещё один · <Kbd>Esc</Kbd> отмена
      </>
    );
  } else if (tool === 'window' || tool === 'door') {
    content = <>Кликните по стене или перегородке, чтобы добавить {tool === 'window' ? 'окно' : 'дверь'} · <Kbd>Esc</Kbd> отмена</>;
  } else if (tool === 'partition') {
    content = <>Кликните по полу, чтобы поставить перегородку · <Kbd>Esc</Kbd> отмена</>;
  } else if (camera === 'fps') {
    content = (
      <>
        <Kbd>ЛКМ</Kbd> осмотреться · <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> идти · <Kbd>Shift</Kbd> бег · <Kbd>Space</Kbd> прыжок · <Kbd>C</Kbd> присесть
      </>
    );
  }
  return content ? (
    <div className={cn(styles.overlay, styles.hint)} role="status">
      {content}
    </div>
  ) : null;
};
