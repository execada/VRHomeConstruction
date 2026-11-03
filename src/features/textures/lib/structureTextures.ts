/**
 * Процедурные текстуры конструкционных материалов стен: кладка из кирпича и блоков,
 * литой и монолитный бетон, листы гипсокартона, деревянный брус.
 * Все рисунки бесшовные (тайл повторяется без стыков) и детерминированные.
 * Параметры подобраны под реальные модули: кирпич 250×65 мм, газобетон 625×250 мм и т.д.
 * @module textures/lib/structureTextures
 */

import type { TextureDraw } from '../types';
import { addNoise, seeded } from './procedural';

/** Диапазон значения [от, до]. */
type Range = readonly [number, number];

/** Кладка рядами со смещением (кирпич, блоки). */
export interface BondPattern {
  /** Блоков в ряду на тайл */
  columns: number;
  /** Рядов на тайл */
  rows: number;
  /** Толщина шва в долях высоты ряда */
  joint: number;
  /** Цвет шва */
  mortar: string;
  /** Оттенок, насыщенность и светлота блоков (HSL) */
  hue: Range;
  sat: Range;
  light: Range;
  /** Амплитуда шума яркости */
  noise: number;
  /** Пор на тайл (ячеистые материалы) */
  pores?: number;
  seed: number;
}

/** Литой бетон: основной цвет, пятна, поры. */
export interface ConcretePattern {
  base: string;
  /** Пятен (разводов) на тайл */
  blotches: number;
  pores: number;
  noise: number;
  seed: number;
}

const pick = (rand: () => number, [a, b]: Range) => a + rand() * (b - a);

/** Нарисовать фигуру с переносом через края тайла (бесшовность). */
function wrapped(size: number, draw: (dx: number, dy: number) => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) draw(dx, dy);
  }
}

/** Круглые поры (тёмные точки) с переносом через края. */
function drawPores(ctx: CanvasRenderingContext2D, size: number, count: number, seed: number, color: string): void {
  const rand = seeded(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = Math.max(0.6, rand() * size * 0.006);
    wrapped(size, (dx, dy) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Цвета блоков одного тайла: периодичны по столбцам и рядам. */
function blockColors(p: BondPattern): string[][] {
  const rand = seeded(p.seed);
  return Array.from({ length: p.rows }, () =>
    Array.from({ length: p.columns }, () => `hsl(${pick(rand, p.hue)}, ${pick(rand, p.sat)}%, ${pick(rand, p.light)}%)`),
  );
}

/**
 * Кладка рядами со смещением на полблока (ложковая перевязка).
 * @param p - модуль кладки и цвета
 */
export function bondTexture(p: BondPattern): TextureDraw {
  return (ctx, size) => {
    const colors = blockColors(p);
    const bw = size / p.columns;
    const bh = size / p.rows;
    const gap = Math.max(1, bh * p.joint);
    ctx.fillStyle = p.mortar;
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < p.rows; row += 1) {
      const offset = row % 2 ? bw / 2 : 0;
      for (let col = -1; col <= p.columns; col += 1) {
        ctx.fillStyle = colors[row][((col % p.columns) + p.columns) % p.columns];
        ctx.fillRect(col * bw + offset + gap / 2, row * bh + gap / 2, bw - gap, bh - gap);
      }
    }
    addNoise(ctx, size, p.noise, p.seed + 1);
    if (p.pores) drawPores(ctx, size, p.pores, p.seed + 2, 'rgba(60, 58, 54, 0.35)');
  };
}

/** Мягкие пятна-разводы (бетон). */
function drawBlotches(ctx: CanvasRenderingContext2D, size: number, count: number, seed: number): void {
  const rand = seeded(seed);
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.08 + rand() * 0.18);
    const dark = rand() > 0.5;
    ctx.fillStyle = dark ? 'rgba(40, 40, 40, 0.06)' : 'rgba(255, 255, 255, 0.07)';
    wrapped(size, (dx, dy) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Литой бетон: однородная серая масса с разводами и порами. */
export function concreteTexture(p: ConcretePattern): TextureDraw {
  return (ctx, size) => {
    ctx.fillStyle = p.base;
    ctx.fillRect(0, 0, size, size);
    drawBlotches(ctx, size, p.blotches, p.seed);
    addNoise(ctx, size, p.noise, p.seed + 1);
    drawPores(ctx, size, p.pores, p.seed + 2, 'rgba(50, 50, 50, 0.4)');
  };
}

/**
 * Монолитный железобетон: бетон со швами щитов опалубки и отверстиями от стяжек.
 * @param p - бетон (цвет, пятна, поры)
 * @param panels - щитов по горизонтали и вертикали на тайл
 */
export function formworkTexture(p: ConcretePattern, panels: { columns: number; rows: number }): TextureDraw {
  const concrete = concreteTexture(p);
  return (ctx, size) => {
    concrete(ctx, size);
    const pw = size / panels.columns;
    const ph = size / panels.rows;
    ctx.strokeStyle = 'rgba(45, 45, 45, 0.35)';
    ctx.lineWidth = Math.max(1, size / 400);
    for (let c = 0; c < panels.columns; c += 1) {
      for (let r = 0; r < panels.rows; r += 1) {
        ctx.strokeRect(c * pw, r * ph, pw, ph);
        ctx.fillStyle = 'rgba(35, 35, 35, 0.55)';
        for (const [fx, fy] of [[0.25, 0.5], [0.75, 0.5]] as const) {
          ctx.beginPath();
          ctx.arc(c * pw + pw * fx, r * ph + ph * fy, Math.max(1.2, size / 220), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };
}

/** Листы гипсокартона 1200 мм: светлый картон, проклеенный шов и ряды саморезов. */
export function drywallTexture(seed: number): TextureDraw {
  return (ctx, size) => {
    ctx.fillStyle = '#dedcd6';
    ctx.fillRect(0, 0, size, size);
    addNoise(ctx, size, 6, seed);
    const tape = size * 0.04;
    ctx.fillStyle = 'rgba(250, 249, 246, 0.85)';
    ctx.fillRect(size - tape / 2, 0, tape / 2, size);
    ctx.fillRect(0, 0, tape / 2, size);
    ctx.fillStyle = 'rgba(70, 70, 70, 0.45)';
    const r = Math.max(0.8, size / 400);
    for (const x of [size * 0.02, size * 0.5, size * 0.98]) {
      for (let k = 0; k < 6; k += 1) {
        ctx.beginPath();
        ctx.arc(x, ((k + 0.5) * size) / 6, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

/** Деревянный брус: горизонтальные бруски с волокнами и тёмными пазами. */
export function timberTexture(beams: number, seed: number): TextureDraw {
  return (ctx, size) => {
    const rand = seeded(seed);
    const bh = size / beams;
    for (let i = 0; i < beams; i += 1) {
      const light = 40 + rand() * 12;
      ctx.fillStyle = `hsl(${28 + rand() * 8}, ${42 + rand() * 10}%, ${light}%)`;
      ctx.fillRect(0, i * bh, size, bh);
      ctx.strokeStyle = `hsla(26, 45%, ${light - 14}%, 0.45)`;
      ctx.lineWidth = Math.max(1, size / 512);
      for (let g = 0; g < 5; g += 1) {
        const y = i * bh + bh * (0.15 + rand() * 0.7);
        const amp = bh * 0.08 * rand();
        const phase = rand() * Math.PI * 2;
        ctx.beginPath();
        for (let x = 0; x <= size; x += size / 32) {
          const yy = y + Math.sin((x / size) * Math.PI * 4 + phase) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30, 18, 8, 0.55)';
      ctx.fillRect(0, i * bh, size, Math.max(1, bh * 0.05));
    }
    addNoise(ctx, size, 10, seed + 1);
  };
}
