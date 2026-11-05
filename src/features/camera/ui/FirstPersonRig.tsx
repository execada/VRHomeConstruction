/**
 * Камера от первого лица: зажатая левая кнопка мыши — осмотреться, WASD — идти,
 * Shift — бег, Space — прыжок, Ctrl/C — присесть, клик по двери — открыть/закрыть.
 * Со столкновениями нельзя пройти сквозь стены, закрытые двери, окна и мебель (скольжение
 * вдоль них); через пустые проёмы и открытые двери можно переходить из комнаты в комнату
 * и выйти на участок. Без столкновений — свободный полёт по участку вокруг комнаты.
 * @module camera/ui/FirstPersonRig
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useStore, useSelector } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import type { RootState } from '@/app/store';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { cachedWalkObstacles } from '@/features/editor-3d/lib/layoutCache';
import { furnitureFootprint, isFlatItem } from '@/features/editor-3d/lib/placement';
import { lotRect } from '@/features/editor-3d/lib/walls';
import { clamp } from '@/shared/lib/math/geometry2d';
import { selectors } from '../selectors';
import { moveDirection, stepPlayer } from '../lib/firstPerson';
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
const PITCH_LIMIT = Math.PI / 2.1;
const REPORT_INTERVAL = 0.5;

export const FirstPersonRig: React.FC = () => {
  const store = useStore<RootState>();
  const dims = useSelector(editorSelectors.selectDimensions);
  const collisions = useSelector(selectors.selectCollisions);
  const gl = useThree((s) => s.gl);
  const input = useFirstPersonInput(gl.domElement);
  const motion = useRef({ eye: STAND_EYE, jump: 0, velocity: 0, sinceReport: 0 });
  const bounds = useMemo(() => lotRect(dims), [dims]);

  useEffect(() => {
    const restore = takeRestorePose('fps');
    if (restore) {
      input.current.pitch = clamp(restore.rotation[0], -PITCH_LIMIT, PITCH_LIMIT);
      input.current.yaw = restore.rotation[1];
    }
    input.current.start = restore ? [restore.position[0], restore.position[2]] : [0, dims.depth / 4];
    // Только при монтировании: восстановление позиции из сохранённой сессии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ camera, gl: renderer }, rawDelta) => {
    if (renderer.xr.isPresenting) return;
    const delta = Math.min(rawDelta, 0.1);
    const i = input.current;
    const m = motion.current;
    if (i.start) {
      camera.position.set(i.start[0], m.eye, i.start[1]);
      i.start = null;
    }
    camera.rotation.set(i.pitch, i.yaw, 0, 'YXZ');

    const crouch = i.keys.has('ControlLeft') || i.keys.has('ControlRight') || i.keys.has('KeyC');
    const sprint = (i.keys.has('ShiftLeft') || i.keys.has('ShiftRight')) && !crouch;
    const speed = (sprint ? SPRINT : WALK) * (crouch ? CROUCH_FACTOR : 1);
    const forward = (i.keys.has('KeyW') ? 1 : 0) - (i.keys.has('KeyS') ? 1 : 0);
    const right = (i.keys.has('KeyD') ? 1 : 0) - (i.keys.has('KeyA') ? 1 : 0);
    const dir = moveDirection({ forward, right }, i.yaw);

    if (dir[0] !== 0 || dir[1] !== 0) {
      const state = store.getState();
      const obstacles = collisions
        ? [
            ...cachedWalkObstacles(state.editor),
            ...state.furniture.items.filter((f) => !isFlatItem(f) && f.position[1] < m.eye).map(furnitureFootprint),
          ]
        : [];
      const next = stepPlayer([camera.position.x, camera.position.z], [dir[0] * speed * delta, dir[1] * speed * delta], bounds, obstacles);
      camera.position.x = next[0];
      camera.position.z = next[1];
    }

    m.eye += ((crouch ? CROUCH_EYE : STAND_EYE) - m.eye) * Math.min(1, delta * 12);
    if (i.keys.has('Space') && m.jump <= 0 && m.velocity <= 0) m.velocity = JUMP_VELOCITY;
    if (m.jump > 0 || m.velocity > 0) {
      m.velocity -= GRAVITY * delta;
      m.jump = Math.max(0, m.jump + m.velocity * delta);
      if (m.jump === 0) m.velocity = 0;
    }
    camera.position.y = m.eye + m.jump;

    m.sinceReport += delta;
    if (m.sinceReport > REPORT_INTERVAL) {
      m.sinceReport = 0;
      reportCameraPose({
        mode: 'fps',
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [0, 0, 0],
        rotation: [i.pitch, i.yaw, 0],
      });
    }
  });

  return <PerspectiveCamera makeDefault fov={65} near={0.05} far={CAMERA_FAR} />;
};
