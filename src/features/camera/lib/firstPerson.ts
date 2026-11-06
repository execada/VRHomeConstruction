/**
 * Перемещение от первого лица: шаг игрока со столкновениями (стены, перегородки, мебель)
 * и скольжением вдоль препятствий, подъём и спуск по ступеням, прыжок и падение.
 * Без столкновений — свободный полёт.
 * @module camera/lib/firstPerson
 */

import { add2, clampObbToRect, length2, obbOverlap, scale2, type Obb, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';

/** Полуразмер «тела» игрока на полу, м. */
export const PLAYER_RADIUS = 0.22;
/** Максимальный подшаг (чтобы не «проскакивать» тонкие перегородки). */
const SUBSTEP = 0.05;

/**
 * Направление движения на полу по нажатым клавишам и повороту камеры.
 * @param input - вперёд/вправо (−1..1)
 * @param yaw - поворот камеры вокруг вертикали
 */
export function moveDirection(input: { forward: number; right: number }, yaw: number): Vec2 {
  const forward: Vec2 = [-Math.sin(yaw), -Math.cos(yaw)];
  const right: Vec2 = [Math.cos(yaw), -Math.sin(yaw)];
  const dir = add2(scale2(forward, input.forward), scale2(right, input.right));
  const len = length2(dir);
  return len > 1 ? scale2(dir, 1 / len) : dir;
}

/**
 * Сделать шаг с учётом столкновений.
 * @param position - текущая позиция [x, z]
 * @param delta - желаемое смещение [dx, dz]
 * @param bounds - внутренние границы комнаты (null — без ограничений)
 * @param obstacles - футпринты препятствий
 */
export function stepPlayer(position: Vec2, delta: Vec2, bounds: Rect | null, obstacles: Obb[]): Vec2 {
  const distance = length2(delta);
  const steps = Math.max(1, Math.ceil(distance / SUBSTEP));
  const step = scale2(delta, 1 / steps);
  let body: Obb = { center: position, half: [PLAYER_RADIUS, PLAYER_RADIUS], angle: 0 };
  for (let i = 0; i < steps; i += 1) {
    body = { ...body, center: add2(body.center, step) };
    for (const obstacle of obstacles) {
      const hit = obbOverlap(body, obstacle);
      if (hit.overlapping) body = { ...body, center: add2(body.center, hit.mtv) };
    }
    if (bounds) body = clampObbToRect(body, bounds);
  }
  return body.center;
}

/** Вертикальное состояние игрока: высота ступней, скорость и стоит ли он на опоре. */
export interface VerticalState {
  feet: number;
  velocity: number;
  grounded: boolean;
}

/**
 * Вертикальный шаг: на опоре ступни следуют за ней (ступень вверх или вниз не выше maxStep —
 * без падения), прыжок даёт скорость вверх, над пропастью — падение с ускорением.
 * @param state - текущее состояние
 * @param ground - высота опоры под игроком (null — опоры нет, остаёмся на месте)
 * @param dt - шаг времени, с
 * @param physics - прыжок (скорость, 0 — без прыжка), ускорение падения, предельная ступенька
 */
export function stepVertical(
  state: VerticalState,
  ground: number | null,
  dt: number,
  physics: { jump: number; gravity: number; maxStep: number },
): VerticalState {
  if (ground === null) return { ...state, velocity: 0, grounded: true };
  if (state.grounded && Math.abs(ground - state.feet) <= physics.maxStep) {
    return physics.jump > 0 ? { feet: ground, velocity: physics.jump, grounded: false } : { feet: ground, velocity: 0, grounded: true };
  }
  const velocity = (state.grounded ? 0 : state.velocity) - physics.gravity * dt;
  const feet = state.feet + velocity * dt;
  return feet <= ground ? { feet: ground, velocity: 0, grounded: true } : { feet, velocity, grounded: false };
}
