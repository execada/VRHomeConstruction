/**
 * Перемещение в VR: телепорт (стик вперёд + луч на пол), плавное движение левым стиком,
 * поворот правым стиком рывками по 30°. Плавное движение упирается в стены, закрытые двери,
 * окна и мебель (скольжение вдоль них) и проходит через пустые проёмы и открытые двери —
 * так же, как от первого лица. Телепорт не ставит игрока внутрь стены.
 * Во время перетаскивания мебели правый стик поворачивает предмет, а не игрока.
 * @module vr/ui/VrRig
 */

import React, { useRef } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import { TeleportTarget, XROrigin, useXRControllerLocomotion } from '@react-three/xr';
import { Vector3, type Group } from 'three';
import type { RootState } from '@/app/store';
import { stepPlayer } from '@/features/camera/lib/firstPerson';
import { selectors as cameraSelectors } from '@/features/camera/selectors';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { cachedWalkObstacles } from '@/features/editor-3d/lib/layoutCache';
import { furnitureFootprint, isFlatItem } from '@/features/editor-3d/lib/placement';
import { lotRect } from '@/features/editor-3d/lib/walls';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useExternalStore } from '@/shared/lib/externalStore';
import { sub2, type Obb, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';

/** Высота глаз (мебель ниже — препятствие), м. */
const EYE = 1.6;

export const VrRig: React.FC = () => {
  const store = useStore<RootState>();
  const dims = useSelector(editorSelectors.selectDimensions);
  const collisions = useSelector(cameraSelectors.selectCollisions);
  const camera = useThree((s) => s.camera);
  const origin = useRef<Group>(null);
  const last = useRef<Vec2 | null>(null);
  const dragging = useExternalStore(interactionStore, (s) => s.mode === 'dragging' || s.mode === 'rotating');

  useXRControllerLocomotion(origin, { speed: 1.6 }, dragging ? false : { type: 'snap', degrees: 30 }, 'left');

  const bounds = (): Rect => lotRect(dims);
  const obstacles = (): Obb[] => {
    if (!collisions) return [];
    const { editor, furniture } = store.getState();
    return [...cachedWalkObstacles(editor), ...furniture.items.filter((f) => !isFlatItem(f) && f.position[1] < EYE).map(furnitureFootprint)];
  };

  // Плавное движение: сдвиг начала координат за кадр проверяется столкновениями головы.
  useFrame(() => {
    const o = origin.current;
    if (!o) return;
    const now: Vec2 = [o.position.x, o.position.z];
    const prev = last.current;
    if (prev && (now[0] !== prev[0] || now[1] !== prev[1])) {
      const delta = sub2(now, prev);
      const head = camera.getWorldPosition(new Vector3());
      const before: Vec2 = [head.x - delta[0], head.z - delta[1]];
      const resolved = stepPlayer(before, delta, bounds(), obstacles());
      o.position.x += resolved[0] - head.x;
      o.position.z += resolved[1] - head.z;
    }
    last.current = [o.position.x, o.position.z];
  });

  const onTeleport = (point: Vector3) => {
    const [x, z] = stepPlayer([point.x, point.z], [0, 0], bounds(), obstacles());
    origin.current?.position.set(x, 0, z);
    last.current = [x, z];
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
