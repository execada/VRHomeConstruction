/**
 * План сверху: ортографическая камера, передняя стена внизу экрана.
 * Панорама и масштаб без вращения; мебель и перегородки перетаскиваются как в 3D.
 * @module camera/ui/TopRig
 */

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useThree } from '@react-three/fiber';
import { MapControls, OrthographicCamera } from '@react-three/drei';
import type { OrthographicCamera as OrthographicCameraImpl } from 'three';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors } from '../selectors';
import { topViewZoom } from '../lib/views';
import { useControlsLock } from './useControlsLock';

const HEIGHT = 60;

/** Экземпляр контролов плана (тип из drei, без прямой зависимости от three-stdlib). */
type MapControlsImpl = React.ComponentRef<typeof MapControls>;

export const TopRig: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const viewRequest = useSelector(selectors.selectViewRequest);
  const size = useThree((s) => s.size);
  const cameraRef = useRef<OrthographicCameraImpl>(null);
  const controls = useRef<MapControlsImpl>(null);
  useControlsLock(controls);

  // Вписать комнату при открытии плана, изменении размеров и по запросу «Сбросить вид».
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.zoom = topViewZoom(dims, size);
    camera.position.set(0, HEIGHT, 0);
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    // Размер окна намеренно не в зависимостях: пользовательский масштаб не сбрасывается при ресайзе.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, viewRequest]);

  return (
    <>
      <OrthographicCamera ref={cameraRef} makeDefault position={[0, HEIGHT, 0]} up={[0, 0, -1]} near={0.1} far={HEIGHT * 3} />
      <MapControls ref={controls} makeDefault enableRotate={false} screenSpacePanning enableDamping dampingFactor={0.15} />
    </>
  );
};
