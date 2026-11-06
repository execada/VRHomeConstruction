/**
 * Детали лестницы для отрисовки (локальная система марша, см. lib/stairs/stairs):
 * проступи и площадка, подступёнки, поручни на стойках по обеим сторонам марша
 * и стеклянное ограждение выреза на этаже выше (с трёх сторон — кроме выхода с марша).
 * @module editor-3d/lib/stairs/stairParts
 */

import { BALUSTRADE_HEIGHT, HANDRAIL_HEIGHT, nosingLine, stairHeightAt, stairTreads, type StairLayout } from './stairs';

/** Брусок: размеры, центр и наклон вокруг оси x (поручень вдоль марша). */
export interface StairBox {
  size: [number, number, number];
  center: [number, number, number];
  tilt?: number;
}

/** Все детали лестницы. */
export interface StairParts {
  treads: StairBox[];
  risers: StairBox[];
  posts: StairBox[];
  rails: StairBox[];
  glass: StairBox[];
}

/** Толщина проступи и площадки, подступёнка, тетивы, сечения стоек и поручня, стекла, м. */
const TREAD = 0.04;
const LANDING = 0.12;
const RISER = 0.02;
export const STRINGER = 0.05;
const POST = 0.035;
const RAIL = 0.045;
const GLASS = 0.012;
/** Шаг стоек поручня вдоль марша, м. */
const POST_STEP = 1;

/** Высота линии носков в точке t (кусочно-линейно). */
function nosingAt(layout: StairLayout, t: number): number {
  const line = nosingLine(layout);
  for (let i = line.length - 1; i > 0; i -= 1) {
    const [a, b] = [line[i - 1], line[i]];
    if (t >= a[0] - 1e-9 && b[0] - a[0] > 1e-9 && t <= b[0] + 1e-9) return a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return t <= 0 ? line[0][1] : line[line.length - 1][1];
}

/** Поручень вдоль линии носков на высоте HANDRAIL_HEIGHT. */
function flightRails(layout: StairLayout, x: number, z: (t: number) => number): StairBox[] {
  const line = nosingLine(layout);
  return line.slice(1).map((b, i) => {
    const a = line[i];
    const dt = b[0] - a[0];
    const dh = b[1] - a[1];
    return {
      size: [RAIL, RAIL, Math.hypot(dt, dh) + RAIL],
      center: [x, (a[1] + b[1]) / 2 + HANDRAIL_HEIGHT, z((a[0] + b[0]) / 2)],
      tilt: Math.atan2(dh, dt),
    };
  });
}

/** Стойки поручня: от проступи до поручня, равномерно вдоль марша. */
function flightPosts(layout: StairLayout, x: number, z: (t: number) => number): StairBox[] {
  const span = Math.max(0, layout.length - 0.2);
  const count = Math.max(2, Math.ceil(span / POST_STEP) + 1);
  return Array.from({ length: count }, (_, i) => {
    const t = 0.1 + (span * i) / (count - 1);
    const base = stairHeightAt(layout, t);
    const top = nosingAt(layout, t) + HANDRAIL_HEIGHT;
    return { size: [POST, top - base, POST], center: [x, (base + top) / 2, z(t)] };
  });
}

/** Ограждение выреза на этаже выше: две длинные стороны и сторона над низом марша. */
function balustrade(layout: StairLayout, width: number, z: (t: number) => number): Pick<StairParts, 'glass' | 'rails' | 'posts'> {
  const { length, rise } = layout;
  const side = width / 2 - STRINGER / 2;
  const panel = BALUSTRADE_HEIGHT - RAIL;
  const railY = rise + BALUSTRADE_HEIGHT - RAIL / 2;
  const end = z(0) - GLASS / 2;
  return {
    glass: [
      { size: [GLASS, panel, length], center: [-side, rise + panel / 2, 0] },
      { size: [GLASS, panel, length], center: [side, rise + panel / 2, 0] },
      { size: [width, panel, GLASS], center: [0, rise + panel / 2, end] },
    ],
    rails: [
      { size: [RAIL, RAIL, length], center: [-side, railY, 0] },
      { size: [RAIL, RAIL, length], center: [side, railY, 0] },
      { size: [width, RAIL, RAIL], center: [0, railY, end] },
    ],
    posts: [-side, side].flatMap((x) => [z(0), z(length)].map((pz) => ({ size: [POST, BALUSTRADE_HEIGHT, POST] as [number, number, number], center: [x, rise + BALUSTRADE_HEIGHT / 2, pz] as [number, number, number] }))),
  };
}

/**
 * Детали лестницы.
 * @param layout - раскладка ступеней
 * @param width - ширина марша
 */
export function stairParts(layout: StairLayout, width: number): StairParts {
  const z = (t: number) => layout.length / 2 - t;
  const inner = width - 2 * STRINGER;
  const treads = stairTreads(layout);
  const sides = [-(width / 2 - STRINGER / 2), width / 2 - STRINGER / 2];
  const top = balustrade(layout, width, z);
  return {
    treads: treads.map((t) => {
      const thickness = t.landing ? LANDING : TREAD;
      return { size: [inner, thickness, t.to - t.from], center: [0, t.top - thickness / 2, z((t.from + t.to) / 2)] };
    }),
    risers: treads.map((t) => {
      const h = layout.riser - TREAD;
      return { size: [inner, h, RISER], center: [0, (t.step - 1) * layout.riser + h / 2, z(t.from) - RISER / 2] };
    }),
    posts: [...sides.flatMap((x) => flightPosts(layout, x, z)), ...top.posts],
    rails: [...sides.flatMap((x) => flightRails(layout, x, z)), ...top.rails],
    glass: top.glass,
  };
}
