/**
 * 2D-геометрия плоскости пола (оси X и Z мира).
 * Все функции чистые: принимают значения и возвращают новые, ничего не мутируют.
 *
 * Соглашение о поворотах совпадает с three.js: поворот на угол θ вокруг +Y
 * переводит локальную ось +X в (cos θ, −sin θ), а локальную +Z — в (sin θ, cos θ).
 * @module shared/lib/math/geometry2d
 */

/** Точка или вектор на плоскости пола: [x, z]. */
export type Vec2 = readonly [number, number];

/** Ориентированный прямоугольник (футпринт объекта на полу). */
export interface Obb {
  /** Центр в мировых координатах [x, z] */
  center: Vec2;
  /** Половины размеров вдоль локальных осей X и Z */
  half: Vec2;
  /** Поворот вокруг вертикальной оси (радианы) */
  angle: number;
}

/** Осевой прямоугольник [minX, maxX] × [minZ, maxZ]. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Результат проверки пересечения двух OBB. */
export interface OverlapResult {
  overlapping: boolean;
  /** Минимальный вектор, на который нужно сдвинуть первый прямоугольник, чтобы выйти из второго */
  mtv: Vec2;
  /** Глубина проникновения (м) */
  depth: number;
}

const EPS = 1e-9;

export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale2 = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot2 = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const length2 = (a: Vec2): number => Math.hypot(a[0], a[1]);

/** Единичный вектор того же направления (нулевой вектор остаётся нулевым). */
export function normalize2(a: Vec2): Vec2 {
  const len = length2(a);
  return len < EPS ? [0, 0] : [a[0] / len, a[1] / len];
}

/** Ограничить число диапазоном [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Привязка к шагу сетки. */
export function snapTo(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/** Нормализовать угол в диапазон (−π, π]. */
export function normalizeAngle(angle: number): number {
  // Уже нормализованный угол возвращаем как есть: многократные клампы при перетаскивании не накапливают погрешность.
  if (angle > -Math.PI && angle <= Math.PI) return angle;
  const twoPi = Math.PI * 2;
  const wrapped = ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return wrapped <= -Math.PI + EPS ? Math.PI : wrapped;
}

/** Привязать угол к шагу (например, 15°), результат нормализован. */
export function snapAngle(angle: number, step: number): number {
  return normalizeAngle(snapTo(angle, step));
}

/** Повернуть вектор локальных координат в мировые (поворот вокруг +Y). */
export function rotateLocal(local: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [local[0] * c + local[1] * s, -local[0] * s + local[1] * c];
}

/** Перевести мировой вектор в локальные координаты объекта с поворотом angle. */
export function toLocal(world: Vec2, angle: number): Vec2 {
  return rotateLocal(world, -angle);
}

/** Локальные оси прямоугольника в мировых координатах. */
export function obbAxes(obb: Obb): readonly [Vec2, Vec2] {
  return [rotateLocal([1, 0], obb.angle), rotateLocal([0, 1], obb.angle)];
}

/** Четыре угла OBB (по часовой стрелке, начиная с −X −Z). */
export function obbCorners(obb: Obb): Vec2[] {
  const [hx, hz] = obb.half;
  const locals: Vec2[] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  return locals.map((p) => add2(obb.center, rotateLocal(p, obb.angle)));
}

/** Полуразмеры осевого bounding box вокруг OBB. */
export function obbExtents(obb: Obb): Vec2 {
  const c = Math.abs(Math.cos(obb.angle));
  const s = Math.abs(Math.sin(obb.angle));
  const [hx, hz] = obb.half;
  return [hx * c + hz * s, hx * s + hz * c];
}

/** Осевой bounding box вокруг OBB. */
export function obbBounds(obb: Obb): Rect {
  const [ex, ez] = obbExtents(obb);
  return {
    minX: obb.center[0] - ex,
    maxX: obb.center[0] + ex,
    minZ: obb.center[1] - ez,
    maxZ: obb.center[1] + ez,
  };
}

/** Радиус проекции OBB на ось (единичный вектор). */
function projectionRadius(obb: Obb, axis: Vec2): number {
  const [ax, az] = obbAxes(obb);
  return obb.half[0] * Math.abs(dot2(ax, axis)) + obb.half[1] * Math.abs(dot2(az, axis));
}

/**
 * Проверка пересечения двух OBB методом разделяющих осей (SAT).
 * Касание (нулевая глубина) пересечением не считается.
 * @param a - прямоугольник, который будем выталкивать
 * @param b - препятствие
 * @returns флаг пересечения, глубину и вектор выталкивания для `a`
 */
export function obbOverlap(a: Obb, b: Obb): OverlapResult {
  const axes = [...obbAxes(a), ...obbAxes(b)];
  const delta = sub2(b.center, a.center);
  let best: OverlapResult = { overlapping: true, mtv: [0, 0], depth: Infinity };

  for (const axis of axes) {
    const distance = dot2(delta, axis);
    const overlap = projectionRadius(a, axis) + projectionRadius(b, axis) - Math.abs(distance);
    if (overlap <= 1e-6) {
      return { overlapping: false, mtv: [0, 0], depth: 0 };
    }
    if (overlap < best.depth) {
      const direction = distance > 0 ? -1 : 1;
      best = { overlapping: true, mtv: scale2(axis, overlap * direction), depth: overlap };
    }
  }
  return best;
}

/**
 * Вписать OBB внутрь прямоугольника, сдвигая только центр.
 * Если объект шире области — центрируется по этой оси.
 */
export function clampObbToRect(obb: Obb, rect: Rect): Obb {
  const [ex, ez] = obbExtents(obb);
  const fit = (value: number, min: number, max: number, extent: number) =>
    max - min < extent * 2 ? (min + max) / 2 : clamp(value, min + extent, max - extent);
  return {
    ...obb,
    center: [fit(obb.center[0], rect.minX, rect.maxX, ex), fit(obb.center[1], rect.minZ, rect.maxZ, ez)],
  };
}

/** Лежит ли OBB целиком внутри прямоугольника (с допуском). */
export function obbInsideRect(obb: Obb, rect: Rect, tolerance = 1e-6): boolean {
  const b = obbBounds(obb);
  return (
    b.minX >= rect.minX - tolerance &&
    b.maxX <= rect.maxX + tolerance &&
    b.minZ >= rect.minZ - tolerance &&
    b.maxZ <= rect.maxZ + tolerance
  );
}

/** Лежит ли точка внутри OBB. */
export function pointInObb(point: Vec2, obb: Obb): boolean {
  const local = toLocal(sub2(point, obb.center), obb.angle);
  return Math.abs(local[0]) <= obb.half[0] + EPS && Math.abs(local[1]) <= obb.half[1] + EPS;
}
