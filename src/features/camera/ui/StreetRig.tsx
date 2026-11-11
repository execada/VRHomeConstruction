/**
 * «Улица»: облёт здания снаружи — все этажи, стены у камеры не срезаются, видны
 * перекрытия, террасы и крыша. Камера не подлетает ближе габаритов здания и не уходит
 * под землю; «Сбросить вид» возвращает общий план здания.
 * @module camera/ui/StreetRig
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { selectors } from '../selectors';
import { CAMERA_FAR, streetView } from '../lib/views';
import { reportCameraPose, takeRestorePose } from '../model/cameraSession';
import { useCameraTransition } from './useCameraTransition';
import { useControlsLock } from './useControlsLock';
import { EnvironmentFeature } from '@/features/environment';
import { STOREY_HEIGHT, storeyElevation } from '@/features/editor-3d/lib/site';

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

export const StreetRig: React.FC = () => {
  const apartment = useSelector(buildingSelectors.selectBuildingBounds);
  const lot = useSelector(buildingSelectors.selectBuildingLot);
  const apartmentHeight = useSelector(buildingSelectors.selectBuildingHeight);
  const residence = useSelector(EnvironmentFeature.selectors.selectResidence);
  // Квартира в многоэтажке: в кадре весь дом — от земли до крыши (см. editor-3d/lib/site).
  const frame = residence.enabled
    ? { bounds: lot, height: (residence.storeys - residence.storey + 1) * STOREY_HEIGHT, base: -storeyElevation(residence.storey) }
    : { bounds: apartment, height: apartmentHeight, base: 0 };
  const { bounds, height, base } = frame;
  const viewRequest = useSelector(selectors.selectViewRequest);
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const flyTo = useCameraTransition(controls);
  const view = useMemo(() => streetView(bounds, Math.max(height, apartmentHeight), base), [bounds, height, apartmentHeight, base]);
  const initialRequest = useRef(viewRequest);
  useControlsLock(controls);

  useEffect(() => {
    const restore = takeRestorePose('street');
    flyTo(restore ?? view.pose, Boolean(restore));
    // Только при монтировании: восстановление позы или перелёт к общему плану здания.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (viewRequest !== initialRequest.current) flyTo(view.pose);
    // Перелёт только по явному запросу пользователя (кнопка «Сбросить вид»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  const report = () => {
    const target = controls.current?.target;
    if (!target) return;
    reportCameraPose({
      mode: 'street',
      position: camera.position.toArray() as [number, number, number],
      target: target.toArray() as [number, number, number],
      rotation: [0, 0, 0],
    });
  };

  return (
    <>
      <PerspectiveCamera makeDefault fov={50} near={0.1} far={CAMERA_FAR} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enablePan={false}
        minDistance={view.minDistance}
        maxDistance={view.maxDistance}
        maxPolarAngle={view.maxPolarAngle}
        onEnd={report}
      />
    </>
  );
};
