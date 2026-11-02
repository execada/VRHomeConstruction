/**
 * Поверхности опор (столешницы, полки, крышки тумб) в мировых координатах и размещение
 * предмета на поверхности: выбор поверхности лучом указателя (3D, VR) или точкой плана (2D,
 * клавиатура), высота ровно по поверхности (не висит и не проваливается), футпринт вписан
 * в край поверхности (не свисает) и вытолкнут из соседних предметов.
 *
 * Поверхности модели измеряются по её мешам (см. furniture/lib/surfaceScan); пока модель
 * не загружена, поверхностью считается верх её габарита.
 * @module editor-3d/lib/surfaces
 */

import { add2, length2, normalizeAngle, pointInObb, rotateLocal, sub2, toLocal, type Obb, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { ModelSurface } from '@/features/furniture/lib/surfaceScan';
import type { FurnitureItem } from '@/features/furniture/types';
import { itemSizes, resolvePlacement, type PlacementObstacle } from './placement';

/** Точка или вектор в пространстве [x, y, z]. */
export type Vec3 = readonly [number, number, number];

/** Луч в мировых координатах (указатель мыши или контроллер VR). */
export interface Ray3 {
  origin: Vec3;
  direction: Vec3;
}

/** Поверхность опоры в мировых координатах. */
export interface SupportSurface {
  supportId: string;
  /** Высота поверхности над полом, м */
  y: number;
  /** Прямоугольник поверхности на плане */
  area: Obb;
  /** Свободная высота над поверхностью (до полки выше или потолка), м */
  clearance: number;
}

/** Предпочтительная поверхность: опора и высота уровня (например, где предмет стоит сейчас). */
export interface SurfacePreference {
  supportId?: string | null;
  y?: number;
}

/** Результат размещения на поверхности. */
export interface SurfacePlacement {
  footprint: Obb;
  /** Высота низа предмета — высота поверхности, м */
  y: number;
  supportId: string;
  /** Предмет помещается: внутри поверхности, по высоте и ни с чем не пересекается */
  valid: boolean;
}

const HEIGHT_EPSILON = 1e-3;
const SAME_LEVEL = 0.02;
const SPOT_STEP = 0.05;

/** Поверхность по умолчанию — верх габарита модели (при scale = 1). */
function boundingTop(item: FurnitureItem): ModelSurface {
  const s = item.scale > 0 ? item.scale : 1;
  const { halfWidth, halfDepth, height } = itemSizes(item);
  return { y: height / s, minX: -halfWidth / s, maxX: halfWidth / s, minZ: -halfDepth / s, maxZ: halfDepth / s, clearance: Infinity };
}

function toWorld(support: FurnitureItem, surface: ModelSurface, ceiling: number): SupportSurface {
  const s = support.scale > 0 ? support.scale : 1;
  const angle = support.rotation[1];
  const local: Vec2 = [((surface.minX + surface.maxX) / 2) * s, ((surface.minZ + surface.maxZ) / 2) * s];
  const y = support.position[1] + surface.y * s;
  return {
    supportId: support.id,
    y,
    area: {
      center: add2([support.position[0], support.position[2]], rotateLocal(local, angle)),
      half: [((surface.maxX - surface.minX) / 2) * s, ((surface.maxZ - surface.minZ) / 2) * s],
      angle,
    },
    clearance: Math.min(surface.clearance * s, ceiling - y),
  };
}

/**
 * Поверхности опоры в мировых координатах.
 * @param support - предмет-опора
 * @param measured - поверхности модели (undefined или пусто — верх габарита)
 * @param ceiling - высота потолка: свободная высота над поверхностью не больше неё
 */
export function supportSurfaces(support: FurnitureItem, measured: readonly ModelSurface[] | undefined, ceiling = Infinity): SupportSurface[] {
  const model = measured && measured.length > 0 ? measured : [boundingTop(support)];
  return model.map((surface) => toWorld(support, surface, ceiling));
}

const fits = (surface: SupportSurface, height: number) => height <= surface.clearance + HEIGHT_EPSILON;
const areaOf = (surface: SupportSurface) => surface.area.half[0] * surface.area.half[1];

/** Порядок выбора среди поверхностей под точкой: помещается → предпочтительная → выше → больше. */
function rank(surfaces: SupportSurface[], height: number, prefer: SurfacePreference | null): SupportSurface[] {
  const preferred = (s: SupportSurface) =>
    Boolean(prefer?.supportId) && s.supportId === prefer?.supportId && (prefer?.y === undefined || Math.abs(s.y - prefer.y) < SAME_LEVEL);
  const score = (s: SupportSurface) => (fits(s, height) ? 2 : 0) + (preferred(s) ? 1 : 0);
  return [...surfaces].sort((a, b) => score(b) - score(a) || b.y - a.y || areaOf(b) - areaOf(a));
}

/**
 * Поверхность под точкой плана (2D, клавиатура, поля инспектора): текущая, если она всё ещё
 * под точкой, иначе самая высокая, на которую предмет помещается по высоте.
 * @returns null — точка не над опорой
 */
export function surfaceAtPoint(
  surfaces: readonly SupportSurface[],
  point: Vec2,
  height: number,
  prefer: SurfacePreference | null,
): SupportSurface | null {
  const under = surfaces.filter((s) => pointInObb(point, s.area));
  return under.length > 0 ? rank(under, height, prefer)[0] : null;
}

/**
 * Поверхность, на которую указывает луч: ближайшая вдоль луча, увиденная сверху
 * (луч сквозь проём стеллажа попадает на полку, на которую смотрит пользователь).
 * @returns поверхность и точка попадания на плане или null
 */
export function surfaceByRay(surfaces: readonly SupportSurface[], ray: Ray3, height: number): { surface: SupportSurface; point: Vec2 } | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dy >= -1e-9) return null;
  const hits = surfaces.flatMap((surface) => {
    const t = (surface.y - oy) / dy;
    const point: Vec2 = [ox + dx * t, oz + dz * t];
    return t > 0 && pointInObb(point, surface.area) ? [{ surface, point, t }] : [];
  });
  if (hits.length === 0) return null;
  const nearest = Math.min(...hits.map((h) => h.t));
  const sameLevel = hits.filter((h) => h.t - nearest < 1e-6);
  const best = rank(sameLevel.map((h) => h.surface), height, null)[0];
  const hit = sameLevel.find((h) => h.surface === best)!;
  return { surface: hit.surface, point: hit.point };
}

/**
 * Поставить предмет на поверхность: низ — на высоту поверхности, футпринт вписан
 * в её прямоугольник и вытолкнут из соседних предметов (расчёт в системе координат поверхности).
 * @param footprint - желаемый футпринт предмета
 * @param height - высота предмета, м
 * @param surface - поверхность
 * @param obstacles - препятствия без самого предмета и без его опоры
 */
export function placeOnSurface(
  footprint: Obb,
  height: number,
  surface: SupportSurface,
  obstacles: readonly PlacementObstacle[],
): SurfacePlacement {
  const frame = surface.area;
  const toFrame = (o: Obb): Obb => ({ ...o, center: toLocal(sub2(o.center, frame.center), frame.angle), angle: normalizeAngle(o.angle - frame.angle) });
  const rect = { minX: -frame.half[0], maxX: frame.half[0], minZ: -frame.half[1], maxZ: frame.half[1] };
  // Предметы на поверхности сталкиваются всегда, даже очень плоские (книги, подставки).
  const local = obstacles.map((o) => ({ ...o, footprint: toFrame(o.footprint), flat: false }));
  const subject = { footprint: toFrame(footprint), yRange: [surface.y, surface.y + height] as const, flat: false };
  const result = resolvePlacement(subject, rect, local, { gridStep: null, wallMagnet: 0 });
  return {
    footprint: { ...footprint, center: add2(frame.center, rotateLocal(result.footprint.center, frame.angle)) },
    y: surface.y,
    supportId: surface.supportId,
    valid: result.valid && fits(surface, height),
  };
}

/**
 * Свободное место на поверхности рядом с желаемым (кольца с шагом 5 см).
 * @returns размещение или null, если на поверхности нет места
 */
export function findSurfaceSpot(
  footprint: Obb,
  height: number,
  surface: SupportSurface,
  obstacles: readonly PlacementObstacle[],
): SurfacePlacement | null {
  const direct = placeOnSurface(footprint, height, surface, obstacles);
  if (direct.valid) return direct;
  if (!fits(surface, height)) return null;
  const maxRadius =
    length2(sub2(footprint.center, surface.area.center)) + Math.hypot(surface.area.half[0], surface.area.half[1]) + Math.max(...footprint.half);
  for (let radius = SPOT_STEP; radius <= maxRadius; radius += SPOT_STEP) {
    const samples = Math.max(8, Math.round((2 * Math.PI * radius) / SPOT_STEP));
    for (let k = 0; k < samples; k += 1) {
      const a = (k / samples) * Math.PI * 2;
      const center = add2(footprint.center, [Math.cos(a) * radius, Math.sin(a) * radius]);
      const attempt = placeOnSurface({ ...footprint, center }, height, surface, obstacles);
      if (attempt.valid) return attempt;
    }
  }
  return null;
}
