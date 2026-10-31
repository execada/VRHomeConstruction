/**
 * Перемещение в VR: телепорт (стик вперёд + луч на пол), плавное движение левым стиком,
 * поворот правым стиком рывками по 30°. Игрок не выходит за стены комнаты.
 * Во время перетаскивания мебели правый стик поворачивает предмет, а не игрока.
 * @module vr/ui/VrRig
 */

import React, { useRef } from 'react';
import { useSelector } from 'react-redux';
import { useFrame } from '@react-three/fiber';
import { TeleportTarget, XROrigin, useXRControllerLocomotion } from '@react-three/xr';
import type { Group, Vector3 } from 'three';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useExternalStore } from '@/shared/lib/externalStore';
import { clamp } from '@/shared/lib/math/geometry2d';

const MARGIN = 0.25;

export const VrRig: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const origin = useRef<Group>(null);
  const dragging = useExternalStore(interactionStore, (s) => s.mode === 'dragging' || s.mode === 'rotating');

  useXRControllerLocomotion(origin, { speed: 1.6 }, dragging ? false : { type: 'snap', degrees: 30 }, 'left');

  // Не выходить за стены после плавного движения.
  useFrame(() => {
    const o = origin.current;
    if (!o) return;
    o.position.x = clamp(o.position.x, -dims.width / 2 + MARGIN, dims.width / 2 - MARGIN);
    o.position.z = clamp(o.position.z, -dims.depth / 2 + MARGIN, dims.depth / 2 - MARGIN);
  });

  const onTeleport = (point: Vector3) => {
    origin.current?.position.set(
      clamp(point.x, -dims.width / 2 + MARGIN, dims.width / 2 - MARGIN),
      0,
      clamp(point.z, -dims.depth / 2 + MARGIN, dims.depth / 2 - MARGIN),
    );
  };

  return (
    <>
      <XROrigin ref={origin} position={[0, 0, Math.min(1, dims.depth / 4)]} />
      <TeleportTarget onTeleport={onTeleport}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <planeGeometry args={[dims.width, dims.depth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </TeleportTarget>
    </>
  );
};
