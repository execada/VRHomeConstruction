/**
 * Плавный перелёт камеры к позе (фикс-виды, сброс вида, восстановление сессии).
 * Запрос выполняется в ближайшем кадре с актуальными камерой и controls: при смене
 * режима камера по умолчанию и controls пересоздаются уже после эффектов React.
 * @module camera/ui/useCameraTransition
 */

import { useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Camera } from 'three';
import type { ViewPose } from '../lib/views';

interface TargetHolder {
  target: Vector3;
  update?: () => void;
}

interface Flight {
  from: Vector3;
  fromTarget: Vector3;
  to: Vector3;
  toTarget: Vector3;
  t: number;
}

const DURATION = 0.7;

/** easeInOutCubic */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function aim(camera: Camera, controls: TargetHolder | null, target: Vector3) {
  if (controls) {
    controls.target.copy(target);
    controls.update?.();
  } else {
    camera.lookAt(target);
  }
}

/**
 * @param controls - controls с полем target (OrbitControls); `{ current: null }` — камера без controls
 * @returns функция запуска перелёта (instant — мгновенно)
 */
export function useCameraTransition(controls: React.RefObject<TargetHolder | null>) {
  const request = useRef<{ pose: ViewPose; instant: boolean } | null>(null);
  const flight = useRef<Flight | null>(null);

  useFrame(({ camera }, delta) => {
    const pending = request.current;
    if (pending) {
      request.current = null;
      const to = new Vector3(...pending.pose.position);
      const toTarget = new Vector3(...pending.pose.target);
      if (pending.instant) {
        camera.position.copy(to);
        aim(camera, controls.current, toTarget);
        flight.current = null;
      } else {
        const fromTarget = controls.current ? controls.current.target.clone() : toTarget.clone();
        flight.current = { from: camera.position.clone(), fromTarget, to, toTarget, t: 0 };
      }
    }
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + delta / DURATION);
    const k = ease(f.t);
    camera.position.lerpVectors(f.from, f.to, k);
    aim(camera, controls.current, new Vector3().lerpVectors(f.fromTarget, f.toTarget, k));
    if (f.t >= 1) flight.current = null;
  });

  return useCallback((pose: ViewPose, instant = false) => {
    // Мгновенный запрос, ещё не выполненный, не превращается в анимацию (повторный эффект StrictMode).
    request.current = { pose, instant: instant || Boolean(request.current?.instant) };
  }, []);
}
