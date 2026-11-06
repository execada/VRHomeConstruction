/**
 * 3D-вьюпорт редактора: Canvas с настройками графики, WebXR, камеры, сцена,
 * приём перетаскивания моделей из каталога и клик, ставящий модель туда, где стоит призрак.
 * Смена сглаживания пересоздаёт WebGL-контекст (это параметр создания контекста).
 * @module widgets/scene-viewport/ui/SceneViewport
 */

import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cn from 'classnames';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { CameraRig } from '@/features/camera/ui/CameraRig';
import { GraphicsFeature } from '@/features/graphics';
import { computeDpr } from '@/features/graphics/lib/presets';
import { FloorSwitcher } from '@/features/editor-3d/ui/FloorSwitcher';
import { SceneContent } from '@/features/editor-3d/ui/scene/SceneContent';
import { CLICK_TOLERANCE_PX } from '@/features/editor-3d/ui/scene/pointer';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { ghostAim, interaction, interactionStore, isPointerBusy, MODEL_DRAG_TYPE } from '@/features/editor-3d/model/interactionStore';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { sceneBridge } from '@/features/editor-3d/model/sceneBridge';
import type { VrStore } from '@/features/vr/lib/createVrStore';
import { SceneLoader } from './SceneLoader';
import { FpsBadge, ViewportHint, ViewportToolbar } from './ViewportOverlays';
import styles from './SceneViewport.module.scss';
import { CAMERA_FAR } from '@/features/camera/lib/views';

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
        if (path && ghost) commands.furniture.place(path, placingName ?? '', ghost.center, ghost.angle, ghostAim(ghost));
        interaction.reset();
      },
    },
  };
}

/** Поставить лестницу туда, где стоит её призрак (инструмент «Лестница»). */
function usePlaceStair() {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  return (shiftKey: boolean): boolean => {
    const { placingStair, stairGhost } = interactionStore.getState();
    if (!placingStair || !stairGhost) return false;
    const id = commands.stairs.place(stairGhost.stair.kind, stairGhost.stair.position, stairGhost.stair.rotation);
    if (id && !shiftKey) dispatch(editorActions.setActiveTool('select'));
    return true;
  };
}

/**
 * Клик по сцене в режиме размещения ставит модель туда, где стоит призрак (на пол, стол или полку),
 * а с инструментом «Лестница» — лестницу. Обрабатывается до объектов сцены: иначе стена
 * или потолок за призраком перехватили бы клик и выделились. Поворот камеры перетаскиванием
 * кликом не считается.
 */
function usePlacementClick() {
  const commands = useSceneCommands();
  const placeStair = usePlaceStair();
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDownCapture: (e: React.PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const start = down.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TOLERANCE_PX) return;
      if (placeStair(e.shiftKey)) {
        e.stopPropagation();
        return;
      }
      const { mode, placingPath, placingName, ghost } = interactionStore.getState();
      if (mode !== 'placing' || !placingPath || !ghost) return;
      e.stopPropagation();
      const id = commands.furniture.place(placingPath, placingName ?? '', ghost.center, ghost.angle, ghostAim(ghost));
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
        camera={{ position: [6, 5, 6], fov: 50, near: 0.05, far: CAMERA_FAR }}
        onPointerMissed={() => !isPointerBusy() && commands.select(null)}
      >
        <XR store={xrStore}>
          <CameraRig />
          <SceneContent onSave={onSave} />
        </XR>
      </Canvas>
      <SceneLoader />
      <FloorSwitcher className={styles.floors} />
      <ViewportHint />
      <ViewportToolbar />
      <FpsBadge />
    </div>
  );
};
