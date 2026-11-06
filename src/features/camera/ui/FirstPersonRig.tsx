/**
 * Камера от первого лица: зажатая левая кнопка мыши — осмотреться, WASD — идти,
 * Shift — бег, Space — прыжок, Ctrl/C — присесть, клик по двери — открыть/закрыть.
 * Со столкновениями нельзя пройти сквозь стены, закрытые двери, окна, мебель и ограждения
 * (скольжение вдоль них); через пустые проёмы и открытые двери можно переходить из комнаты
 * в комнату и выйти на участок или террасу. По лестнице поднимаются и спускаются: высота глаз
 * следует ступеням, а на другом этаже он становится активным (его свет, двери, правки).
 * Без столкновений — свободное хождение сквозь стены по участку вокруг здания.
 * @module camera/ui/FirstPersonRig
 */

import React, { useEffect, useRef } from 'react';
import { useStore, useSelector } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import type { RootState } from '@/app/store';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { floorIndexAt } from '@/features/editor-3d/lib/building/floors';
import { groundAt, MAX_STEP, obstaclesAt } from '@/features/editor-3d/lib/building/walk';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { clamp } from '@/shared/lib/math/geometry2d';
import { selectors } from '../selectors';
import { MAX_WALK_FRAME, moveDirection, walkFrame, type WalkQuery } from '../lib/firstPerson';
import { reportCameraPose, takeRestorePose } from '../model/cameraSession';
import { useFirstPersonInput } from './useFirstPersonInput';
import { CAMERA_FAR } from '../lib/views';

const WALK = 2.2;
const SPRINT = 4.5;
const CROUCH_FACTOR = 0.45;
const STAND_EYE = 1.6;
const CROUCH_EYE = 0.95;
const JUMP_VELOCITY = 4.2;
const GRAVITY = 14;
/** Скорость, с которой взгляд догоняет ступени (1/с): шаг по лестнице плавный, но заметный. */
const STEP_SMOOTH = 14;
const PITCH_LIMIT = Math.PI / 2.1;
const REPORT_INTERVAL = 0.5;
/** Сколько секунд человек должен пробыть на другом этаже, чтобы тот стал активным. */
const FLOOR_SWITCH_DELAY = 0.3;
/** Отступ от фасада, с которого начинают обход здания с улицы, м. */
const STREET_START = 3;

/** Вертикальное состояние и сглаживание взгляда. */
interface Motion {
  eye: number;
  feet: number;
  view: number;
  velocity: number;
  grounded: boolean;
  sinceReport: number;
  /** Этаж под ногами, отличный от активного, и сколько времени человек на нём */
  pending: { index: number; time: number } | null;
}

export const FirstPersonRig: React.FC<{ outside?: boolean }> = ({ outside = false }) => {
  const store = useStore<RootState>();
  const commands = useSceneCommands();
  const collisions = useSelector(selectors.selectCollisions);
  const gl = useThree((s) => s.gl);
  const input = useFirstPersonInput(gl.domElement);
  const motion = useRef<Motion>({ eye: STAND_EYE, feet: 0, view: 0, velocity: 0, grounded: true, sinceReport: 0, pending: null });

  useEffect(() => {
    const state = store.getState();
    const frame = buildingSelectors.selectActiveFrame(state);
    const restore = takeRestorePose('fps');
    const m = motion.current;
    if (restore) {
      input.current.pitch = clamp(restore.rotation[0], -PITCH_LIMIT, PITCH_LIMIT);
      input.current.yaw = restore.rotation[1];
      input.current.start = [restore.position[0], restore.position[2]];
      m.feet = Math.max(0, restore.position[1] - STAND_EYE);
    } else if (outside) {
      // С улицы — перед фасадом здания, лицом к нему.
      const bounds = buildingSelectors.selectBuildingBounds(state);
      input.current.start = [(bounds.minX + bounds.maxX) / 2, bounds.maxZ + STREET_START];
      input.current.yaw = 0;
      m.feet = 0;
    } else {
      const dims = state.editor.dimensions;
      input.current.start = [frame.offset[0], frame.offset[1] + dims.depth / 4];
      m.feet = frame.base;
    }
    m.view = m.feet;
    // Только при монтировании: стартовая точка (сохранённая, с улицы или на активном этаже).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Сделать активным этаж под ногами, если человек задержался на нём. */
  const followFloor = (state: RootState, delta: number) => {
    const m = motion.current;
    const frames = buildingSelectors.selectFloorFrames(state);
    const index = floorIndexAt(frames, m.feet);
    if (index === buildingSelectors.selectActiveIndex(state) || !m.grounded) {
      m.pending = null;
      return;
    }
    m.pending = m.pending?.index === index ? { index, time: m.pending.time + delta } : { index, time: 0 };
    if (m.pending.time >= FLOOR_SWITCH_DELAY) {
      m.pending = null;
      commands.floors.activate(frames[index].id);
    }
  };

  useFrame(({ camera, gl: renderer }, rawDelta) => {
    if (renderer.xr.isPresenting) return;
    const delta = Math.min(rawDelta, MAX_WALK_FRAME);
    const i = input.current;
    const m = motion.current;
    if (i.start) {
      camera.position.set(i.start[0], m.feet + m.eye, i.start[1]);
      i.start = null;
    }
    camera.rotation.set(i.pitch, i.yaw, 0, 'YXZ');

    const crouch = i.keys.has('ControlLeft') || i.keys.has('ControlRight') || i.keys.has('KeyC');
    const sprint = (i.keys.has('ShiftLeft') || i.keys.has('ShiftRight')) && !crouch;
    const speed = (sprint ? SPRINT : WALK) * (crouch ? CROUCH_FACTOR : 1);
    const forward = (i.keys.has('KeyW') ? 1 : 0) - (i.keys.has('KeyS') ? 1 : 0);
    const right = (i.keys.has('KeyD') ? 1 : 0) - (i.keys.has('KeyA') ? 1 : 0);
    const dir = moveDirection({ forward, right }, i.yaw);
    const state = store.getState();
    const world = buildingSelectors.selectWalkWorld(state);
    const jump = i.keys.has('Space') && m.grounded ? JUMP_VELOCITY : 0;
    const query: WalkQuery = {
      bounds: world.bounds,
      obstacles: (feet) => (collisions ? obstaclesAt(world, feet, m.eye) : []),
      ground: (point, feet) => groundAt(world, point, feet),
    };
    const next = walkFrame(
      { position: [camera.position.x, camera.position.z], vertical: m },
      { direction: dir, speed, jump },
      query,
      rawDelta,
      { gravity: GRAVITY, maxStep: MAX_STEP },
    );
    camera.position.x = next.position[0];
    camera.position.z = next.position[1];
    m.feet = next.vertical.feet;
    m.velocity = next.vertical.velocity;
    m.grounded = next.vertical.grounded;
    m.view = m.grounded ? m.view + (m.feet - m.view) * Math.min(1, delta * STEP_SMOOTH) : m.feet;
    m.eye += ((crouch ? CROUCH_EYE : STAND_EYE) - m.eye) * Math.min(1, delta * 12);
    camera.position.y = m.view + m.eye;
    followFloor(state, delta);

    m.sinceReport += delta;
    if (m.sinceReport > REPORT_INTERVAL) {
      m.sinceReport = 0;
      reportCameraPose({
        mode: 'fps',
        position: [camera.position.x, m.feet + STAND_EYE, camera.position.z],
        target: [0, 0, 0],
        rotation: [i.pitch, i.yaw, 0],
      });
    }
  });

  return <PerspectiveCamera makeDefault fov={65} near={0.05} far={CAMERA_FAR} />;
};
