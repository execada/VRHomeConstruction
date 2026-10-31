/**
 * Солнце: направленный свет снаружи дома. Положение и цвет зависят от времени суток
 * и выбранной стороны (передняя/задняя). Теневая камера охватывает всю комнату —
 * солнечные пятна от окон чёткие на любом размере комнаты.
 * @module editor-3d/ui/scene/SunLight
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Object3D } from 'three';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { selectors as editorSelectors } from '../../selectors';
import { sunState } from '../../lib/sun';

interface SunLightProps {
  shadowsEnabled: boolean;
  shadowMapSize: number;
}

export const SunLight: React.FC<SunLightProps> = memo(({ shadowsEnabled, shadowMapSize }) => {
  const sun = useSelector(environmentSelectors.selectSun);
  const dims = useSelector(editorSelectors.selectDimensions);
  const state = useMemo(() => sunState(sun.timeOfDay, sun.side), [sun.timeOfDay, sun.side]);
  const target = useMemo(() => new Object3D(), []);

  const intensity = sun.enabled ? sun.intensity * state.daylight : 0;
  if (intensity < 1e-3) return null;

  const distance = Math.max(dims.width, dims.depth, dims.height) + 14;
  const half = Math.hypot(dims.width, dims.depth) / 2 + dims.height + 1;
  const position: [number, number, number] = [
    state.direction[0] * distance,
    Math.max(0.5, state.direction[1] * distance),
    state.direction[2] * distance,
  ];

  return (
    <>
      <primitive object={target} position={[0, dims.height / 3, 0]} />
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
