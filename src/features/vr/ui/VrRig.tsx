/**
 * Перемещение в VR: телепорт (стик вперёд + луч на пол любого этажа или участка), плавное
 * движение левым стиком, поворот правым стиком рывками по 30°. Плавное движение упирается
 * в стены, закрытые двери, окна, мебель и ограждения (скольжение вдоль них) и проходит
 * через пустые проёмы и открытые двери — так же, как от первого лица. По лестнице
 * поднимаются и спускаются: пол под ногами следует ступеням, а этаж, на котором стоит
 * человек, становится активным. Телепорт не ставит игрока внутрь стены.
 * Во время перетаскивания мебели правый стик поворачивает предмет, а не игрока.
 * @module vr/ui/VrRig
 */

import React, { useEffect, useRef } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import { TeleportTarget, XROrigin, useXRControllerLocomotion } from '@react-three/xr';
import { Vector3, type Group } from 'three';
import type { RootState } from '@/app/store';
import { stepPlayer } from '@/features/camera/lib/firstPerson';
import { selectors as cameraSelectors } from '@/features/camera/selectors';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { floorIndexAt } from '@/features/editor-3d/lib/building/floors';
import { groundAt, obstaclesAt } from '@/features/editor-3d/lib/building/walk';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { useExternalStore } from '@/shared/lib/externalStore';
import { sub2, type Obb, type Vec2 } from '@/shared/lib/math/geometry2d';

/** Высота глаз (мебель ниже — препятствие), м. */
const EYE = 1.6;
/** Скорость, с которой пол под ногами догоняет ступени (1/с). */
const STEP_SMOOTH = 10;
const FLOOR_SWITCH_DELAY = 0.3;

export const VrRig: React.FC = () => {
  const store = useStore<RootState>();
  const commands = useSceneCommands();
  const planes = useSelector(buildingSelectors.selectFloorPlanes);
  const lot = useSelector(buildingSelectors.selectBuildingLot);
  const collisions = useSelector(cameraSelectors.selectCollisions);
  const camera = useThree((s) => s.camera);
  const origin = useRef<Group>(null);
  const last = useRef<Vec2 | null>(null);
  const feet = useRef(0);
  const pending = useRef<{ index: number; time: number } | null>(null);
  const dragging = useExternalStore(interactionStore, (s) => s.mode === 'dragging' || s.mode === 'rotating');

  useXRControllerLocomotion(origin, { speed: 1.6 }, dragging ? false : { type: 'snap', degrees: 30 }, 'left');

  // Старт — на полу активного этажа.
  useEffect(() => {
    const state = store.getState();
    const frame = buildingSelectors.selectActiveFrame(state);
    const depth = state.editor.dimensions.depth;
    feet.current = frame.base;
    origin.current?.position.set(frame.offset[0], frame.base, frame.offset[1] + Math.min(1, depth / 4));
    // Только при входе в VR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const world = () => buildingSelectors.selectWalkWorld(store.getState());
  const obstacles = (): Obb[] => (collisions ? obstaclesAt(world(), feet.current, EYE) : []);

  /** Сделать активным этаж под ногами, если человек задержался на нём. */
  const followFloor = (delta: number) => {
    const state = store.getState();
    const frames = buildingSelectors.selectFloorFrames(state);
    const index = floorIndexAt(frames, feet.current);
    if (index === buildingSelectors.selectActiveIndex(state)) {
      pending.current = null;
      return;
    }
    pending.current = pending.current?.index === index ? { index, time: pending.current.time + delta } : { index, time: 0 };
    if (pending.current.time >= FLOOR_SWITCH_DELAY) {
      pending.current = null;
      commands.floors.activate(frames[index].id);
    }
  };

  // Плавное движение: сдвиг начала координат за кадр проверяется столкновениями головы,
  // пол под ногами — по поверхностям здания (ступени, этажи, терраса, участок).
  useFrame((_, rawDelta) => {
    const o = origin.current;
    if (!o) return;
    const delta = Math.min(rawDelta, 0.1);
    const now: Vec2 = [o.position.x, o.position.z];
    const prev = last.current;
    const head = camera.getWorldPosition(new Vector3());
    if (prev && (now[0] !== prev[0] || now[1] !== prev[1])) {
      const move = sub2(now, prev);
      const before: Vec2 = [head.x - move[0], head.z - move[1]];
      const resolved = stepPlayer(before, move, world().bounds, obstacles());
      o.position.x += resolved[0] - head.x;
      o.position.z += resolved[1] - head.z;
    }
    const ground = groundAt(world(), [head.x, head.z], feet.current);
    if (ground !== null) feet.current = ground;
    o.position.y += (feet.current - o.position.y) * Math.min(1, delta * STEP_SMOOTH);
    last.current = [o.position.x, o.position.z];
    followFloor(delta);
  });

  const onTeleport = (point: Vector3) => {
    const w = world();
    const [x, z] = stepPlayer([point.x, point.z], [0, 0], w.bounds, collisions ? obstaclesAt(w, point.y, EYE) : []);
    feet.current = groundAt(w, [x, z], point.y + 0.05) ?? point.y;
    origin.current?.position.set(x, feet.current, z);
    last.current = [x, z];
  };

  return (
    <>
      <XROrigin ref={origin} />
      <TeleportTarget onTeleport={onTeleport}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(lot.minX + lot.maxX) / 2, 0.002, (lot.minZ + lot.maxZ) / 2]}>
          <planeGeometry args={[lot.maxX - lot.minX, lot.maxZ - lot.minZ]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {planes.map((p) => (
          <mesh key={p.id} rotation={[-Math.PI / 2, 0, 0]} position={[p.offset[0], p.base + 0.003, p.offset[1]]}>
            <planeGeometry args={[p.width, p.depth]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </TeleportTarget>
    </>
  );
};
