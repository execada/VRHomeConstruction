/**
 * Геометрия 2D-редактора: точки SVG, рамка вида, проекция мебели на развёртку стены.
 * Единицы SVG — метры: план — ось X мира вправо, ось Z мира вниз (передняя стена внизу);
 * развёртка — u вдоль стены вправо, высота вверх.
 * @module widgets/plan-editor-2d/lib/plan
 */

import { dot2, obbCorners, sub2, type Obb, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import { furnitureFootprint, itemSizes } from '@/features/editor-3d/lib/placement';
import { stackLevel } from '@/features/editor-3d/lib/supportLinks';
import type { WallFrame } from '@/features/editor-3d/lib/walls';
import type { FurnitureItem } from '@/features/furniture/types';

/** Рамка viewBox SVG. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Атрибут points для многоугольника. */
export function polygonPoints(points: Vec2[]): string {
  return points.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');
}

/** Многоугольник футпринта на плане. */
export function footprintPoints(footprint: Obb): string {
  return polygonPoints(obbCorners(footprint));
}

/** Рамка вида вокруг прямоугольника с полями. */
export function fitViewBox(bounds: Rect, margin: number): ViewBox {
  return {
    x: bounds.minX - margin,
    y: bounds.minZ - margin,
    width: bounds.maxX - bounds.minX + margin * 2,
    height: bounds.maxZ - bounds.minZ + margin * 2,
  };
}

/** Приблизить/отдалить вид вокруг точки (scale < 1 — приближение). */
export function zoomViewBox(view: ViewBox, focus: Vec2, scale: number, limits: { min: number; max: number }): ViewBox {
  const width = Math.min(limits.max, Math.max(limits.min, view.width * scale));
  const k = width / view.width;
  const height = view.height * k;
  return {
    x: focus[0] - (focus[0] - view.x) * k,
    y: focus[1] - (focus[1] - view.y) * k,
    width,
    height,
  };
}

/** Предмет мебели в проекции на стену. */
export interface WallProjection {
  item: FurnitureItem;
  /** Левая и правая граница вдоль стены (u) */
  u0: number;
  u1: number;
  /** Низ и верх (высота над полом) */
  bottom: number;
  top: number;
  /** Расстояние от стены до ближайшей точки предмета */
  depth: number;
}

/**
 * Порядок отрисовки мебели на плане: ковры и низкие предметы снизу, предметы на поверхностях
 * опор (лампа на столе, книги на полке) — поверх своих опор.
 */
export function planDrawOrder(items: readonly FurnitureItem[]): FurnitureItem[] {
  return [...items].sort((a, b) => stackLevel(a) - stackLevel(b) || itemSizes(a).height - itemSizes(b).height);
}

/**
 * Мебель, стоящая у стены (ближе maxDepth), в проекции на её плоскость.
 * Отсортирована от дальних к ближним, чтобы ближние рисовались поверх;
 * предметы на опорах — поверх своих опор (ваза на полке стеллажа не прячется за ним).
 */
export function itemsNearWall(items: FurnitureItem[], frame: WallFrame, maxDepth: number): WallProjection[] {
  return items
    .map((item) => {
      const corners = obbCorners(furnitureFootprint(item)).map((c) => sub2(c, frame.origin));
      const us = corners.map((c) => dot2(c, frame.tangent));
      const depth = Math.min(...corners.map((c) => dot2(c, frame.normal)));
      const bottom = Math.max(0, item.position[1]);
      return { item, u0: Math.min(...us), u1: Math.max(...us), bottom, top: bottom + itemSizes(item).height, depth };
    })
    .filter((p) => p.depth < maxDepth && p.depth > -0.5)
    .sort((a, b) => stackLevel(a.item) - stackLevel(b.item) || b.depth - a.depth);
}

/** Центр предмета после сдвига вдоль стены на du. */
export function slideAlongWall(item: FurnitureItem, frame: WallFrame, du: number): Vec2 {
  return [item.position[0] + frame.tangent[0] * du, item.position[2] + frame.tangent[1] * du];
}
