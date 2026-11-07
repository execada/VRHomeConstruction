/**
 * Элементы поверх 3D-сцены: панель инструментов, счётчик FPS и контекстная подсказка.
 * @module widgets/scene-viewport/ui/ViewportOverlays
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { CameraFeature } from '@/features/camera';
import { GraphicsFeature } from '@/features/graphics';
import { attachOf } from '@/features/editor-3d/lib/attachRole';
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
  { tool: 'partition', icon: 'partition', label: 'Стена: кликните начало и конец на полу' },
  { tool: 'stair', icon: 'stairs', label: 'Лестница на этаж выше: кликните по полу' },
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

/** Подсказка при размещении модели: куда кликать зависит от типа крепления. */
const PlacingHint: React.FC<{ path: string; name: string }> = ({ path, name }) => {
  const attach = attachOf({ modelPath: path, name });
  if (attach === 'wall') {
    return (
      <>
        «{name}»: наведите на стену и кликните — предмет повиснет на ней · <Kbd>Shift</Kbd>+клик — ещё один · <Kbd>Esc</Kbd> отмена
      </>
    );
  }
  const where = attach === 'ceiling' ? 'кликните по полу — предмет повиснет под потолком над этой точкой' : 'кликните по полу, столу или полке, чтобы поставить';
  return (
    <>
      «{name}»: {where} · <Kbd>R</Kbd> поворот · <Kbd>Shift</Kbd>+клик — ещё один · <Kbd>Esc</Kbd> отмена
    </>
  );
};

/** Подсказка по текущему действию. */
export const ViewportHint: React.FC = () => {
  const mode = useExternalStore(interactionStore, (s) => s.mode);
  const placingName = useExternalStore(interactionStore, (s) => s.placingName);
  const placingPath = useExternalStore(interactionStore, (s) => s.placingPath);
  const tool = useSelector(editorSelectors.selectActiveTool);
  const camera = useSelector(CameraFeature.selectors.selectCameraMode);

  let content: React.ReactNode = null;
  if (mode === 'placing') {
    content = <PlacingHint path={placingPath ?? ''} name={placingName ?? ''} />;
  } else if (tool === 'window' || tool === 'door') {
    content = <>Кликните по стене или перегородке, чтобы добавить {tool === 'window' ? 'окно' : 'дверь'} · <Kbd>Esc</Kbd> отмена</>;
  } else if (tool === 'partition') {
    content = (
      <>
        Стена: кликните начало и конец · концы липнут к стенам, углы — к 45° · <Kbd>G</Kbd> сетка · правая кнопка или <Kbd>Esc</Kbd> — закончить
      </>
    );
  } else if (tool === 'stair') {
    content = (
      <>
        Лестница на этаж выше: кликните по полу · <Kbd>R</Kbd> поворот на 90° · <Kbd>Shift</Kbd>+клик — ещё одна · <Kbd>Esc</Kbd> — закончить
      </>
    );
  } else if (camera === 'street') {
    content = (
      <>
        Здание с улицы: тяните — облёт, колесо — ближе и дальше · <Kbd>2</Kbd> — обойти здание от первого лица
      </>
    );
  } else if (camera === 'fps') {
    content = (
      <>
        <Kbd>ЛКМ</Kbd> осмотреться · <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> идти, по лестнице — на другой этаж · <Kbd>Shift</Kbd> бег · <Kbd>Space</Kbd> прыжок · <Kbd>C</Kbd> присесть
      </>
    );
  }
  return content ? (
    <div className={cn(styles.overlay, styles.hint)} role="status">
      {content}
    </div>
  ) : null;
};
