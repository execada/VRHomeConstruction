/**
 * 3D-вьюпорт редактора: Canvas с настройками графики, WebXR, камеры, сцена,
 * приём перетаскивания моделей из каталога и клик, ставящий модель туда, где стоит призрак.
 * Смена сглаживания пересоздаёт WebGL-контекст (это параметр создания контекста).
 * @module widgets/scene-viewport/ui/SceneViewport
 */

import React, { useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import cn from 'classnames';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { CameraRig } from '@/features/camera/ui/CameraRig';
import { GraphicsFeature } from '@/features/graphics';
import { computeDpr } from '@/features/graphics/lib/presets';
import { SceneContent } from '@/features/editor-3d/ui/scene/SceneContent';
import { CLICK_TOLERANCE_PX } from '@/features/editor-3d/ui/scene/pointer';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { interaction, interactionStore, MODEL_DRAG_TYPE } from '@/features/editor-3d/model/interactionStore';
import { sceneBridge } from '@/features/editor-3d/model/sceneBridge';
import type { VrStore } from '@/features/vr/lib/createVrStore';
import { SceneLoader } from './SceneLoader';
import { FpsBadge, ViewportHint, ViewportToolbar } from './ViewportOverlays';
import styles from './SceneViewport.module.scss';

interface SceneViewportProps {
  xrStore: VrStore;
  /** Сохранить проект (VR-меню) */
  onSave: () => void;
}

/** Обработчики перетаскивания модели из каталога в сцену. */
function useCatalogDrop() {
  const commands = useSceneCommands();
  const [active, setActive] = useState(false);

  const preview = (e: React.DragEvent) => {
    const { placingPath, placingAngle, placingName } = interactionStore.getState();
    const point = sceneBridge.screenToFloor(e.clientX, e.clientY);
    const ray = sceneBridge.screenToRay(e.clientX, e.clientY);
    const options = { name: placingName ?? '', aim: ray ? { ray } : {} };
    if (placingPath && point) interaction.setGhost(commands.furniture.previewPlacement(placingPath, point, placingAngle, options));
  };

  return {
    active,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(MODEL_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setActive(true);
        preview(e);
      },
      onDragLeave: () => {
        setActive(false);
        interaction.setGhost(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setActive(false);
        const path = e.dataTransfer.getData(MODEL_DRAG_TYPE);
        const { ghost, placingName } = interactionStore.getState();
        const aim = ghost ? { supportId: ghost.supportId, elevation: ghost.elevation } : {};
        if (path && ghost) commands.furniture.place(path, placingName ?? '', ghost.center, ghost.angle, aim);
        interaction.reset();
      },
    },
  };
}

/**
 * Клик по сцене в режиме размещения ставит модель туда, где стоит призрак (на пол, стол или полку).
 * Обрабатывается до объектов сцены: иначе стена за призраком перехватила бы клик и выделилась.
 * Поворот камеры перетаскиванием кликом не считается.
 */
function usePlacementClick() {
  const commands = useSceneCommands();
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDownCapture: (e: React.PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
    },
    onClickCapture: (e: React.MouseEvent) => {
      const { mode, placingPath, placingName, ghost } = interactionStore.getState();
      if (mode !== 'placing' || !placingPath || !ghost || !(e.target instanceof HTMLCanvasElement)) return;
      const start = down.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TOLERANCE_PX) return;
      e.stopPropagation();
      const aim = { supportId: ghost.supportId, elevation: ghost.elevation };
      const id = commands.furniture.place(placingPath, placingName ?? '', ghost.center, ghost.angle, aim);
      if (id && !e.shiftKey) interaction.reset();
    },
  };
}

export const SceneViewport: React.FC<SceneViewportProps> = ({ xrStore, onSave }) => {
  const graphics = useSelector(GraphicsFeature.selectors.selectGraphics);
  const commands = useSceneCommands();
  const drop = useCatalogDrop();
  const placementClick = usePlacementClick();
  const dpr = computeDpr(typeof window === 'undefined' ? 1 : window.devicePixelRatio, graphics.resolutionScale);
  const shadows = graphics.shadows ? (graphics.preset === 'high' ? 'soft' : 'percentage') : false;

  return (
    <div className={cn(styles.viewport, drop.active && styles.dropActive)} {...drop.handlers} {...placementClick}>
      <Canvas
        key={graphics.antialias ? 'aa' : 'no-aa'}
        shadows={shadows}
        dpr={dpr}
        gl={{ antialias: graphics.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        camera={{ position: [6, 5, 6], fov: 50, near: 0.05, far: 900 }}
        onPointerMissed={() => commands.select(null)}
      >
        <XR store={xrStore}>
          <CameraRig />
          <SceneContent onSave={onSave} />
        </XR>
      </Canvas>
      <SceneLoader />
      <ViewportHint />
      <ViewportToolbar />
      <FpsBadge />
    </div>
  );
};
