/**
 * Содержимое 3D-сцены редактора: окружение, солнце, здание (все этажи), а в группе
 * активного этажа — свет, комната, лестницы, мебель, размещение из каталога, подсказки
 * поверхностей опор, сетка привязки, инструменты стен и лестниц; VR-инструменты.
 * @module editor-3d/ui/scene/SceneContent
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { Grid } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import { selectors as cameraSelectors } from '@/features/camera/selectors';
import { selectors as graphicsSelectors } from '@/features/graphics/selectors';
import { VrDragTools } from '@/features/vr/ui/VrDragTools';
import { VrMenu } from '@/features/vr/ui/VrMenu';
import { VrRig } from '@/features/vr/ui/VrRig';
import { useExternalStore } from '@/shared/lib/externalStore';
import { selectors as editorSelectors } from '../../selectors';
import { interactionStore, GRID_STEP } from '../../model/interactionStore';
import { BuildingScene } from './building/BuildingScene';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { FurnitureLayer } from './FurnitureLayer';
import { PlacementLayer } from './PlacementLayer';
import { RoomLights } from './RoomLights';
import { RoomShell } from './RoomShell';
import { SceneBridge } from './SceneBridge';
import { StairsLayer } from './stairs/StairsLayer';
import { StairTool } from './stairs/StairTool';
import { SunLight } from './SunLight';
import { SurfaceHints } from './SurfaceHints';
import { WallDrawController } from './WallDrawController';

interface SceneContentProps {
  /** Сохранить проект (кнопка VR-меню) */
  onSave: () => void;
}

const SnapGrid: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const visible = useExternalStore(interactionStore, (s) => s.gridEnabled);
  if (!visible) return null;
  return (
    <Grid
      args={[dims.width, dims.depth]}
      position={[0, 0.003, 0]}
      cellSize={GRID_STEP}
      sectionSize={1}
      cellThickness={0.5}
      sectionThickness={1}
      cellColor="#c9a96e"
      sectionColor="#b8543b"
      fadeDistance={40}
      raycast={() => null}
    />
  );
};

export const SceneContent: React.FC<SceneContentProps> = ({ onSave }) => {
  const graphics = useSelector(graphicsSelectors.selectGraphics);
  const cameraMode = useSelector(cameraSelectors.selectCameraMode);
  const inXR = useXR((s) => s.session != null);
  const tool = useSelector(editorSelectors.selectActiveTool);
  // Внутри — от первого лица и в VR; снаружи — «Улица»: здание целиком, без срезов.
  const whole = inXR || cameraMode === 'fps' || cameraMode === 'street';
  const cutaway = !whole;
  const maxLamps = inXR || graphics.preset === 'low' ? 2 : 6;

  return (
    <>
      <SceneBridge />
      <EnvironmentBackdrop />
      <SunLight shadowsEnabled={graphics.shadows} shadowMapSize={inXR ? Math.min(1024, graphics.shadowMapSize) : graphics.shadowMapSize} />
      <BuildingScene hideAbove={!whole}>
        <RoomLights shadowsEnabled={graphics.shadows} shadowMapSize={Math.min(1024, graphics.shadowMapSize)} maxLamps={maxLamps} cutaway={cutaway} />
        <RoomShell cutaway={cutaway} />
        <StairsLayer />
        <FurnitureLayer />
        <PlacementLayer />
        <SurfaceHints />
        <SnapGrid />
        {tool === 'partition' && !inXR && <WallDrawController />}
        {tool === 'stair' && !inXR && <StairTool />}
      </BuildingScene>
      {inXR && (
        <>
          <VrRig />
          <VrDragTools />
          <VrMenu onSave={onSave} />
        </>
      )}
    </>
  );
};
