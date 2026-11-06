/**
 * Посадка подушек на диваны и кресла: положение подушки в посадочном месте (у спинки — нижней
 * задней кромкой к спинке с наклоном места, на сиденье — лёжа по центру места), проверка, что
 * место свободно (подушки мягкие: касание соседей на пару сантиметров допускается) и что подушка
 * помещается на модели по ширине, выбор ближайшего свободного места к точке, куда целится
 * пользователь, и ручной доворот подушки в месте.
 * @module editor-3d/lib/cushionSeats
 */

import {
  add2,
  clamp,
  length2,
  normalizeAngle,
  obbCorners,
  obbOverlap,
  pointInObb,
  rotateLocal,
  scale2,
  sub2,
  toLocal,
  type Obb,
  type Vec2,
} from '@/shared/lib/math/geometry2d';
import type { CushionSocket, CushionStyle } from '@/features/furniture/lib/cushions';
import type { FurnitureItem } from '@/features/furniture/types';
import { furnitureFootprint, itemSizes, uprightSizes } from './placement';
import type { Ray3 } from './surfaces';
import { backEdgeOffset, tiltedExtent } from './tilt';

/** Положение подушки: центр занятого места, высота низа, поворот и наклон назад. */
export interface CushionPose {
  center: Vec2;
  y: number;
  yaw: number;
  tilt: number;
}

/** Место, которое занимает подушка. */
export interface CushionBox {
  footprint: Obb;
  yRange: readonly [number, number];
}

/** Модель с посадочными местами (диван, кресло). */
export interface CushionHost {
  item: FurnitureItem;
  sockets: readonly CushionSocket[];
}

/** Выбранное место: free = false — свободных мест на модели нет (призрак покажет это красным). */
export interface SeatChoice {
  socket: CushionSocket;
  pose: CushionPose;
  free: boolean;
}

/** Подушки мягкие: перекрытие соседей до 2,5 см с каждой стороны не считается столкновением. */
const SOFT = 0.025;
/** Подушка может выступать за габарит модели: по ширине чуть-чуть, вперёд — заметнее. */
const WIDTH_MARGIN = 0.05;
const DEPTH_MARGIN = 0.15;
/** Зона модели для указателя шире её габарита, м. */
const AIM_MARGIN = 0.05;
/** Ручной доворот подушки в месте — не больше этого, рад. */
export const MAX_TWIST = (35 * Math.PI) / 180;

const scaleOf = (item: FurnitureItem) => (item.scale > 0 ? item.scale : 1);
const xz = (item: FurnitureItem): Vec2 => [item.position[0], item.position[2]];

/** Точка места в мире, высота и направление места. */
function anchor(host: FurnitureItem, socket: CushionSocket): { point: Vec2; y: number; yaw: number } {
  const s = scaleOf(host);
  const local: Vec2 = [socket.position[0] * s, socket.position[2] * s];
  return {
    point: add2(xz(host), rotateLocal(local, host.rotation[1])),
    y: host.position[1] + socket.position[1] * s,
    yaw: host.rotation[1] + socket.yaw,
  };
}

/**
 * Положение подушки в месте.
 * @param host - диван или кресло
 * @param socket - посадочное место модели
 * @param cushion - подушка (её модель и масштаб)
 * @param style - как подушка садится
 * @param twist - ручной доворот вокруг вертикали от направления места, рад
 * @returns null — подушка в такое место не садится (набор подушек — только к спинке)
 */
export function socketPose(host: FurnitureItem, socket: CushionSocket, cushion: FurnitureItem, style: CushionStyle, twist = 0): CushionPose | null {
  if (style.upright && socket.kind === 'seat') return null;
  const base = anchor(host, socket);
  const tilt = style.upright ? 0 : socket.tilt;
  const yaw = normalizeAngle(base.yaw + twist);
  if (socket.kind === 'seat') return { center: base.point, y: base.y, yaw, tilt };
  // У спинки задана точка касания нижней задней кромки — центр подушки впереди неё.
  const forward = rotateLocal([0, 1], yaw);
  const center = add2(base.point, scale2(forward, -backEdgeOffset(uprightSizes(cushion), tilt)));
  return { center, y: base.y, yaw, tilt };
}

/** Место, которое занимает подушка в положении. */
export function cushionBox(cushion: FurnitureItem, pose: CushionPose): CushionBox {
  const upright = uprightSizes(cushion);
  const extent = tiltedExtent(upright, pose.tilt);
  return {
    footprint: { center: pose.center, half: [upright.halfWidth, extent.halfDepth], angle: pose.yaw },
    yRange: [pose.y, pose.y + extent.height],
  };
}

/** Место, которое занимает предмет сцены (у подушки в месте — с наклоном). */
export function itemBox(item: FurnitureItem): CushionBox {
  return { footprint: furnitureFootprint(item), yRange: [item.position[1], item.position[1] + itemSizes(item).height] };
}

/** Подушка в месте: позиция, поворот с наклоном, связь с моделью и местом. */
export function seated(cushion: FurnitureItem, host: FurnitureItem, socketId: string, pose: CushionPose): FurnitureItem {
  return {
    ...cushion,
    supportId: host.id,
    socket: socketId,
    position: [pose.center[0], pose.y, pose.center[1]],
    rotation: [pose.tilt === 0 ? 0 : -pose.tilt, pose.yaw, 0],
  };
}

const soft = (footprint: Obb): Obb => ({
  ...footprint,
  half: [Math.max(0.01, footprint.half[0] - SOFT), Math.max(0.01, footprint.half[1] - SOFT)],
});

/** Сталкиваются ли подушки (с допуском на мягкость). */
export function cushionsCollide(a: CushionBox, b: CushionBox): boolean {
  const vertical = a.yRange[0] < b.yRange[1] - 1e-6 && b.yRange[0] < a.yRange[1] - 1e-6;
  return vertical && obbOverlap(soft(a.footprint), soft(b.footprint)).overlapping;
}

/** Помещается ли подушка на модели: по ширине — в её габарит, вперёд может немного выступать. */
export function fitsHost(box: CushionBox, host: FurnitureItem): boolean {
  const frame = furnitureFootprint(host);
  return obbCorners(box.footprint).every((corner) => {
    const local = toLocal(sub2(corner, frame.center), frame.angle);
    return Math.abs(local[0]) <= frame.half[0] + WIDTH_MARGIN && Math.abs(local[1]) <= frame.half[1] + DEPTH_MARGIN;
  });
}

/**
 * Места модели, в которые садится подушка (по ширине помещается), и свободны ли они.
 * @param host - модель с местами
 * @param cushion - подушка (сама себе не мешает)
 * @param style - как подушка садится
 * @param neighbours - другие подушки на этой модели
 */
export function seatOptions(host: CushionHost, cushion: FurnitureItem, style: CushionStyle, neighbours: readonly FurnitureItem[]): SeatChoice[] {
  const others = neighbours.filter((n) => n.id !== cushion.id).map(itemBox);
  return host.sockets.flatMap((socket) => {
    const pose = socketPose(host.item, socket, cushion, style);
    if (!pose) return [];
    const box = cushionBox(cushion, pose);
    return fitsHost(box, host.item) ? [{ socket, pose, free: !others.some((o) => cushionsCollide(box, o)) }] : [];
  });
}

/**
 * Посадочное место для подушки рядом с точкой: ближайшее свободное, а если свободных нет —
 * ближайшее занятое (free = false).
 * @param host - модель с местами
 * @param cushion - подушка (сама себе не мешает)
 * @param style - как подушка садится
 * @param point - куда целится пользователь (на плане)
 * @param neighbours - другие подушки на этой модели
 * @param prefer - место, выбранное заранее (призраком): если свободно — оно
 * @returns null — подушка не садится ни в одно место модели (например, слишком широкая)
 */
export function chooseSeat(
  host: CushionHost,
  cushion: FurnitureItem,
  style: CushionStyle,
  point: Vec2,
  neighbours: readonly FurnitureItem[],
  prefer?: string,
): SeatChoice | null {
  const candidates = seatOptions(host, cushion, style, neighbours);
  const preferred = prefer ? candidates.find((c) => c.socket.id === prefer && c.free) : undefined;
  if (preferred) return preferred;
  const byDistance = [...candidates].sort((a, b) => length2(sub2(a.pose.center, point)) - length2(sub2(b.pose.center, point)));
  return byDistance.find((c) => c.free) ?? (byDistance[0] ? { ...byDistance[0], free: false } : null);
}

/** Зона модели для указателя: её габарит с запасом. */
const aimZone = (host: FurnitureItem): Obb => {
  const footprint = furnitureFootprint(host);
  return { ...footprint, half: [footprint.half[0] + AIM_MARGIN, footprint.half[1] + AIM_MARGIN] };
};

/** Средняя высота мест модели в мире — там луч указателя «встречает» сиденье. */
function seatHeight(host: CushionHost): number {
  const mean = host.sockets.reduce((sum, s) => sum + s.position[1], 0) / Math.max(1, host.sockets.length);
  return host.item.position[1] + mean * scaleOf(host.item);
}

/**
 * Модель с местами, на которую целится пользователь: луч указателя (ближайшая по лучу на высоте
 * её сиденья) или точка плана внутри её габарита.
 * @returns модель и точка на плане, куда указывают (null — указывают не на диван или кресло)
 */
export function hostUnderAim(hosts: readonly CushionHost[], point: Vec2, ray?: Ray3): { host: CushionHost; point: Vec2 } | null {
  if (!ray) {
    const host = hosts.find((h) => pointInObb(point, aimZone(h.item)));
    return host ? { host, point } : null;
  }
  const hits = hosts.flatMap((host) => {
    if (Math.abs(ray.direction[1]) < 1e-6) return [];
    const t = (seatHeight(host) - ray.origin[1]) / ray.direction[1];
    if (t <= 0) return [];
    const hit: Vec2 = [ray.origin[0] + ray.direction[0] * t, ray.origin[2] + ray.direction[2] * t];
    return pointInObb(hit, aimZone(host.item)) ? [{ host, point: hit, t }] : [];
  });
  const nearest = hits.sort((a, b) => a.t - b.t)[0];
  return nearest ? { host: nearest.host, point: nearest.point } : null;
}

/** Доворот подушки в её месте сейчас (от направления места), рад. */
export function currentTwist(cushion: FurnitureItem, host: FurnitureItem, socket: CushionSocket): number {
  return normalizeAngle(cushion.rotation[1] - host.rotation[1] - socket.yaw);
}

/**
 * Положение подушки, повёрнутой в её месте на абсолютный угол (доворот ограничен MAX_TWIST).
 * @returns null — подушка в такое место не садится
 */
export function twistedPose(host: FurnitureItem, socket: CushionSocket, cushion: FurnitureItem, style: CushionStyle, angle: number): CushionPose | null {
  const twist = clamp(normalizeAngle(angle - host.rotation[1] - socket.yaw), -MAX_TWIST, MAX_TWIST);
  return socketPose(host, socket, cushion, style, twist);
}
