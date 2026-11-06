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

/** Опоры и препятствия вокруг игрока (мир для хождения). */
export interface WalkQuery {
  /** Участок: дальше не уйти */
  bounds: Rect;
  /** Препятствия для тела на высоте ступней feet */
  obstacles: (feet: number) => Obb[];
  /** Опора под точкой для ступней на высоте feet (null — опоры нет) */
  ground: (point: Vec2, feet: number) => number | null;
}

/**
 * Самый длинный кадр, который досчитывается целиком, с: при редких кадрах (слабая видеокарта)
 * ходьба идёт в реальном времени, а после паузы вкладки игрок не «телепортируется».
 */
export const MAX_WALK_FRAME = 0.5;
/** Длина подшага: столкновения и ступени считаются одинаково при любой частоте кадров, с. */
const STEP_DT = 1 / 30;

/**
 * Движение игрока за кадр: время кадра делится на короткие подшаги, поэтому скорость ходьбы,
 * подъём по ступеням и прыжок не зависят от частоты кадров (и на медленной машине тоже).
 * @param start - положение на плане и вертикальное состояние
 * @param move - направление (единичное или нулевое), скорость, скорость прыжка (0 — без прыжка)
 * @param query - опоры и препятствия
 * @param delta - время кадра, с
 * @param physics - ускорение падения и предельная ступенька
 */
export function walkFrame(
  start: { position: Vec2; vertical: VerticalState },
  move: { direction: Vec2; speed: number; jump: number },
  query: WalkQuery,
  delta: number,
  physics: { gravity: number; maxStep: number },
): { position: Vec2; vertical: VerticalState } {
  const total = Math.min(Math.max(0, delta), MAX_WALK_FRAME);
  const steps = Math.max(1, Math.ceil(total / STEP_DT - 1e-9));
  const dt = total / steps;
  const moving = move.direction[0] !== 0 || move.direction[1] !== 0;
  let position = start.position;
  let vertical = start.vertical;
  for (let k = 0; k < steps; k += 1) {
    if (moving) position = stepPlayer(position, scale2(move.direction, move.speed * dt), query.bounds, query.obstacles(vertical.feet));
    vertical = stepVertical(vertical, query.ground(position, vertical.feet), dt, { jump: k === 0 ? move.jump : 0, ...physics });
  }
  return { position, vertical };
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
