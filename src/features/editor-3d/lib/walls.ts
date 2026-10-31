/**
 * Геометрия стен: локальные системы координат внешних стен и перегородок,
 * перевод координат «стена ↔ мир», разбиение стены на сегменты вокруг проёмов.
 *
 * Локальная система стены: u — вдоль стены вправо (если смотреть изнутри комнаты),
 * v — высота над полом, depth — расстояние от внутренней грани вглубь комнаты.
 * @module editor-3d/lib/walls
 */

import { add2, dot2, rotateLocal, scale2, sub2, type Rect, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { Opening, Partition, RoomDimensions, WallSide } from '../types';

/** Порядок стен в интерфейсе: передняя, задняя, левая, правая. */
export const WALL_SIDES: readonly WallSide[] = ['front', 'back', 'left', 'right'];

/** Подписи стен для интерфейса. */
export const WALL_LABELS: Record<WallSide, string> = {
  front: 'Передняя',
  back: 'Задняя',
  left: 'Левая',
  right: 'Правая',
};

/** Локальная система координат стены. */
export interface WallFrame {
  /** Стена или id перегородки */
  id: string;
  /** Длина рабочей грани, м */
  length: number;
  /** Высота стены, м */
  height: number;
  /** Центр рабочей грани на уровне пола [x, z] */
  origin: Vec2;
  /** Направление «вправо» вдоль стены */
  tangent: Vec2;
  /** Нормаль рабочей грани (у внешних стен — внутрь комнаты) */
  normal: Vec2;
  /** Поворот вокруг Y, при котором локальная +X совпадает с tangent, +Z — с normal */
  rotationY: number;
}

/** Прямоугольный кусок стены в локальных координатах (u — вдоль, v — по высоте). */
export interface WallPiece {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Параметры бокса внешней стены для рендера. */
export interface WallBox {
  side: WallSide;
  /** Центр нижней грани стены по оси толщины [x, z] */
  base: Vec2;
  rotationY: number;
  /** Полная длина бокса (с заходом на углы) */
  length: number;
  height: number;
  thickness: number;
  /** Заход на углы с каждой стороны, м */
  cornerExtension: number;
}

const ROTATION: Record<WallSide, number> = {
  back: 0,
  left: Math.PI / 2,
  front: Math.PI,
  right: -Math.PI / 2,
};

/** Проверка, что строка — сторона внешней стены. */
export function isWallSide(id: string): id is WallSide {
  return id === 'front' || id === 'back' || id === 'left' || id === 'right';
}

/** Внутренний прямоугольник пола комнаты. */
export function interiorRect(dims: Pick<RoomDimensions, 'width' | 'depth'>): Rect {
  return { minX: -dims.width / 2, maxX: dims.width / 2, minZ: -dims.depth / 2, maxZ: dims.depth / 2 };
}

/**
 * Система координат внешней стены.
 * @param side - сторона стены
 * @param dims - внутренние размеры комнаты
 */
export function wallFrame(side: WallSide, dims: RoomDimensions): WallFrame {
  const rotationY = ROTATION[side];
  const tangent = rotateLocal([1, 0], rotationY);
  const normal = rotateLocal([0, 1], rotationY);
  const along = side === 'front' || side === 'back' ? dims.width : dims.depth;
  const across = side === 'front' || side === 'back' ? dims.depth : dims.width;
  return {
    id: side,
    length: along,
    height: dims.height,
    origin: scale2(normal, -across / 2),
    tangent,
    normal,
    rotationY,
  };
}

/** Системы координат всех четырёх внешних стен (в порядке WALL_SIDES). */
export function wallFrames(dims: RoomDimensions): WallFrame[] {
  return WALL_SIDES.map((side) => wallFrame(side, dims));
}

/**
 * Система координат перегородки: начало — её центр, нормаль — локальная +Z.
 * Длина и высота берутся из size.
 */
export function partitionFrame(partition: Partition): WallFrame {
  const rotationY = partition.rotation[1];
  return {
    id: partition.id,
    length: partition.size[0],
    height: partition.size[1],
    origin: [partition.position[0], partition.position[2]],
    tangent: rotateLocal([1, 0], rotationY),
    normal: rotateLocal([0, 1], rotationY),
    rotationY,
  };
}

/** Перевод локальных координат стены в мировые [x, y, z]. */
export function wallToWorld(frame: WallFrame, u: number, v: number, depth = 0): [number, number, number] {
  const p = add2(add2(frame.origin, scale2(frame.tangent, u)), scale2(frame.normal, depth));
  return [p[0], v, p[1]];
}

/** Перевод мировой точки в локальные координаты стены. */
export function worldToWall(frame: WallFrame, point: readonly [number, number, number]): {
  u: number;
  v: number;
  depth: number;
} {
  const rel = sub2([point[0], point[2]], frame.origin);
  return { u: dot2(rel, frame.tangent), v: point[1], depth: dot2(rel, frame.normal) };
}

/**
 * Бокс внешней стены для рендера. Передняя и задняя стены заходят на углы,
 * чтобы в углах комнаты не было щелей.
 */
export function wallBox(side: WallSide, dims: RoomDimensions, thickness: number): WallBox {
  const frame = wallFrame(side, dims);
  const cornerExtension = side === 'front' || side === 'back' ? thickness : 0;
  return {
    side,
    base: add2(frame.origin, scale2(frame.normal, -thickness / 2)),
    rotationY: frame.rotationY,
    length: frame.length + cornerExtension * 2,
    height: dims.height,
    thickness,
    cornerExtension,
  };
}

/** Отверстие проёма в локальных координатах стены. */
export function openingHole(opening: Opening): WallPiece {
  const [u, y] = opening.position;
  return {
    u0: u - opening.width / 2,
    u1: u + opening.width / 2,
    v0: y - opening.height / 2,
    v1: y + opening.height / 2,
  };
}

/** Свободные интервалы [lo, hi] за вычетом занятых. */
export function freeIntervals(lo: number, hi: number, blocked: Array<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const result: Array<[number, number]> = [];
  let cursor = lo;
  for (const [a, b] of sorted) {
    if (a > cursor + 1e-6) result.push([cursor, Math.min(a, hi)]);
    cursor = Math.max(cursor, b);
    if (cursor >= hi) break;
  }
  if (cursor < hi - 1e-6) result.push([cursor, hi]);
  return result.filter(([a, b]) => b - a > 1e-6);
}

const pieceKey = (p: WallPiece) => `${p.v0.toFixed(5)}|${p.v1.toFixed(5)}`;

/** Склеить соседние по горизонтали куски одинаковой высоты (меньше мешей). */
function mergePieces(pieces: WallPiece[]): WallPiece[] {
  const groups = new Map<string, WallPiece[]>();
  for (const p of pieces) groups.set(pieceKey(p), [...(groups.get(pieceKey(p)) ?? []), p]);
  return [...groups.values()].flatMap((group) =>
    [...group]
      .sort((a, b) => a.u0 - b.u0)
      .reduce<WallPiece[]>((acc, p) => {
        const last = acc[acc.length - 1];
        if (last && Math.abs(last.u1 - p.u0) < 1e-6) return [...acc.slice(0, -1), { ...last, u1: p.u1 }];
        return [...acc, p];
      }, []),
  );
}

/**
 * Разбить стену на прямоугольные куски, обходя проёмы.
 * Устойчиво к пересекающимся и выходящим за край проёмам.
 * @param uMin - левая граница стены
 * @param uMax - правая граница стены
 * @param height - высота стены
 * @param holes - отверстия проёмов
 */
export function wallPieces(uMin: number, uMax: number, height: number, holes: WallPiece[]): WallPiece[] {
  const clipped = holes
    .map((h) => ({ u0: Math.max(uMin, h.u0), u1: Math.min(uMax, h.u1), v0: Math.max(0, h.v0), v1: Math.min(height, h.v1) }))
    .filter((h) => h.u1 - h.u0 > 1e-6 && h.v1 - h.v0 > 1e-6);
  const breaks = [...new Set([uMin, uMax, ...clipped.flatMap((h) => [h.u0, h.u1])])].sort((a, b) => a - b);

  const pieces = breaks.slice(0, -1).flatMap((a, i) => {
    const b = breaks[i + 1];
    const mid = (a + b) / 2;
    const covering = clipped.filter((h) => h.u0 <= mid && h.u1 >= mid).map((h) => [h.v0, h.v1] as const);
    return freeIntervals(0, height, covering).map(([v0, v1]) => ({ u0: a, u1: b, v0, v1 }));
  });
  return mergePieces(pieces);
}

/**
 * Ближайшая к точке внешняя стена и расстояние до её внутренней грани.
 * @param point - точка на полу [x, z]
 * @param dims - размеры комнаты
 */
export function nearestWall(point: Vec2, dims: RoomDimensions): { side: WallSide; distance: number } {
  return WALL_SIDES.map((side) => {
    const frame = wallFrame(side, dims);
    return { side, distance: dot2(sub2(point, frame.origin), frame.normal) };
  }).reduce((best, cur) => (cur.distance < best.distance ? cur : best));
}

/**
 * Скрывать ли стену при взгляде снаружи (эффект «кукольного домика»):
 * стена прячется, если камера находится за её внутренней гранью.
 */
export function isWallFacingAway(frame: WallFrame, cameraXZ: Vec2): boolean {
  return dot2(sub2(cameraXZ, frame.origin), frame.normal) < -0.05;
}
