/**
 * Облёт активного этажа (режим по умолчанию): вращение, масштаб, панорама.
 * Ближние стены и потолок срезаются, этажи выше скрыты, чтобы интерьер был виден.
 * При смене этажа камера переезжает вместе с ним (вид относительно этажа сохраняется).
 * @module camera/ui/OrbitRig
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors } from '../selectors';
import { CAMERA_FAR, fixedViewPose, orbitLimits } from '../lib/views';
import { reportCameraPose, takeRestorePose } from '../model/cameraSession';
import { useCameraTransition } from './useCameraTransition';
import { useControlsLock } from './useControlsLock';

/** Экземпляр контролов облёта (тип из drei, без прямой зависимости от three-stdlib). */
type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

export const OrbitRig: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const frame = useSelector(buildingSelectors.selectActiveFrame);
  const viewRequest = useSelector(selectors.selectViewRequest);
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const flyTo = useCameraTransition(controls);
  const limits = useMemo(() => orbitLimits(dims), [dims]);
  const initialRequest = useRef(viewRequest);
  const placedAt = useRef(frame);
  useControlsLock(controls);

  useEffect(() => {
    const restore = takeRestorePose('orbit');
    flyTo(restore ?? fixedViewPose('iso', dims, frame), true);
    // Только при монтировании: восстановление позы из сохранённой сессии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (viewRequest !== initialRequest.current) flyTo(fixedViewPose('iso', dims, frame));
    // Перелёт только по явному запросу пользователя (кнопка «Сбросить вид»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  // Смена этажа: камера и точка облёта сдвигаются вместе с полом активного этажа.
  useEffect(() => {
    const prev = placedAt.current;
    placedAt.current = frame;
    const target = controls.current?.target;
    if (!target || (prev.base === frame.base && prev.offset[0] === frame.offset[0] && prev.offset[1] === frame.offset[1])) return;
    const d: [number, number, number] = [frame.offset[0] - prev.offset[0], frame.base - prev.base, frame.offset[1] - prev.offset[1]];
    const p = camera.position;
    flyTo({ position: [p.x + d[0], p.y + d[1], p.z + d[2]], target: [target.x + d[0], target.y + d[1], target.z + d[2]] });
  }, [frame, camera, flyTo]);

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
      <PerspectiveCamera makeDefault fov={50} near={0.05} far={CAMERA_FAR} />
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
