/**
 * Солнце: направленный свет снаружи дома. Положение и цвет зависят от времени суток
 * и выбранной стороны (передняя/задняя). Теневая камера охватывает всё здание —
 * солнечные пятна от окон чёткие на любом этаже и размере комнаты.
 * @module editor-3d/ui/scene/SunLight
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Object3D } from 'three';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { buildingSelectors } from '../../building/selectors';
import { sunState } from '../../lib/sun';

interface SunLightProps {
  shadowsEnabled: boolean;
  shadowMapSize: number;
}

export const SunLight: React.FC<SunLightProps> = memo(({ shadowsEnabled, shadowMapSize }) => {
  const sun = useSelector(environmentSelectors.selectSun);
  const bounds = useSelector(buildingSelectors.selectBuildingBounds);
  const height = useSelector(buildingSelectors.selectBuildingHeight);
  const state = useMemo(() => sunState(sun.timeOfDay, sun.side), [sun.timeOfDay, sun.side]);
  const target = useMemo(() => new Object3D(), []);

  const intensity = sun.enabled ? sun.intensity * state.daylight : 0;
  if (intensity < 1e-3) return null;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const center: [number, number, number] = [(bounds.minX + bounds.maxX) / 2, height / 3, (bounds.minZ + bounds.maxZ) / 2];
  const distance = Math.max(width, depth, height) + 14;
  const half = Math.hypot(width, depth) / 2 + height + 1;
  const position: [number, number, number] = [
    center[0] + state.direction[0] * distance,
    Math.max(0.5, center[1] + state.direction[1] * distance),
    center[2] + state.direction[2] * distance,
  ];

  return (
    <>
      <primitive object={target} position={center} />
      <directionalLight
        key={`sun_${shadowMapSize}`}
        position={position}
        target={target}
        color={state.color}
        intensity={intensity}
        castShadow={sun.shadows && shadowsEnabled}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={0.5}
        shadow-camera-far={distance * 2.2}
      />
    </>
  );
});
