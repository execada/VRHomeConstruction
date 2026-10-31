/**
 * Облёт комнаты (режим по умолчанию): вращение, масштаб, панорама.
 * Ближние стены и потолок срезаются, чтобы интерьер был виден.
 * @module camera/ui/OrbitRig
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors } from '../selectors';
import { fixedViewPose, orbitLimits } from '../lib/views';
import { reportCameraPose, takeRestorePose } from '../model/cameraSession';
import { useCameraTransition } from './useCameraTransition';
import { useControlsLock } from './useControlsLock';

/** Экземпляр контролов облёта (тип из drei, без прямой зависимости от three-stdlib). */
type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

export const OrbitRig: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const viewRequest = useSelector(selectors.selectViewRequest);
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const flyTo = useCameraTransition(controls);
  const limits = useMemo(() => orbitLimits(dims), [dims]);
  const initialRequest = useRef(viewRequest);
  useControlsLock(controls);

  useEffect(() => {
    const restore = takeRestorePose('orbit');
    flyTo(restore ?? fixedViewPose('iso', dims), true);
    // Только при монтировании: восстановление позы из сохранённой сессии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (viewRequest !== initialRequest.current) flyTo(fixedViewPose('iso', dims));
    // Перелёт только по явному запросу пользователя (кнопка «Сбросить вид»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  const report = () => {
    const target = controls.current?.target;
    if (!target) return;
    reportCameraPose({
      mode: 'orbit',
      position: camera.position.toArray() as [number, number, number],
      target: target.toArray() as [number, number, number],
      rotation: [0, 0, 0],
    });
  };

  return (
    <>
      <PerspectiveCamera makeDefault fov={50} near={0.05} far={900} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={limits.minDistance}
        maxDistance={limits.maxDistance}
        maxPolarAngle={limits.maxPolarAngle}
        onEnd={report}
      />
    </>
  );
};
