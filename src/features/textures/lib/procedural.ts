/**
 * Процедурные текстуры (рисуются на canvas, без внешних файлов).
 * Лёгкие и всегда доступны — запасной вариант, если каталог ассетов не загрузился.
 * Идентификаторы совпадают с материалами старых проектов (v1).
 * @module textures/lib/procedural
 */

import type { TextureDef, TextureDraw } from '../types';

/** Детерминированный генератор случайных чисел (одинаковый рисунок при каждой генерации). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Добавить детерминированный шум яркости ко всему холсту. */
export function addNoise(ctx: CanvasRenderingContext2D, size: number, amp: number, seed: number) {
  const rand = seeded(seed);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amp;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const brick: TextureDraw = (c, s) => {
  const rand = seeded(7);
  c.fillStyle = '#9c9892';
  c.fillRect(0, 0, s, s);
  const bw = s / 4;
  const bh = s / 8;
  for (let row = 0; row * bh < s; row += 1) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < s + bw; x += bw) {
      c.fillStyle = `hsl(${8 + rand() * 10}, ${42 + rand() * 12}%, ${40 + rand() * 10}%)`;
      c.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
};

const concrete: TextureDraw = (c, s) => {
  c.fillStyle = '#b8babe';
  c.fillRect(0, 0, s, s);
  addNoise(c, s, 24, 11);
};

const wallpaper: TextureDraw = (c, s) => {
  c.fillStyle = '#eceaf3';
  c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(120, 110, 160, 0.10)';
  c.lineWidth = 2;
  for (let x = 0; x < s; x += s / 8) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, s);
    c.stroke();
  }
};

const wood: TextureDraw = (c, s) => {
  const rand = seeded(3);
  const pw = s / 4;
  for (let i = 0; i < 4; i += 1) {
    const l = 28 + rand() * 8;
    c.fillStyle = `hsl(28, 46%, ${l}%)`;
    c.fillRect(i * pw, 0, pw, s);
    c.strokeStyle = `hsla(28, 46%, ${l - 12}%, 0.5)`;
    c.lineWidth = 1;
    for (let g = 0; g < 7; g += 1) {
      const x = i * pw + rand() * pw;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 4, s / 3, x - 4, (2 * s) / 3, x, s);
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(i * pw, 0, 1, s);
  }
};

const laminate: TextureDraw = (c, s) => {
  const rand = seeded(5);
  const ph = s / 5;
  for (let i = 0; i < 5; i += 1) {
    c.fillStyle = `hsl(34, 42%, ${56 + rand() * 10}%)`;
    c.fillRect(0, i * ph, s, ph);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, i * ph, s, 1);
  }
};

const tile: TextureDraw = (c, s) => {
  const rand = seeded(9);
  c.fillStyle = '#c9ccd2';
  c.fillRect(0, 0, s, s);
  const n = 4;
  const t = s / n;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      c.fillStyle = `hsl(210, 12%, ${82 + rand() * 6}%)`;
      c.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
};

const carpet: TextureDraw = (c, s) => {
  c.fillStyle = '#8a8f9c';
  c.fillRect(0, 0, s, s);
  addNoise(c, s, 40, 13);
};

const lightConcrete: TextureDraw = (c, s) => {
  c.fillStyle = '#e9eaec';
  c.fillRect(0, 0, s, s);
  addNoise(c, s, 12, 17);
};

/** Встроенные процедурные текстуры. */
export const PROCEDURAL_TEXTURES: TextureDef[] = [
  { id: 'floor-wood', label: 'Дерево (базовое)', category: 'floor', tileMeters: 1, roughness: 0.7, draw: wood },
  { id: 'floor-laminate', label: 'Ламинат (базовый)', category: 'floor', tileMeters: 1.2, roughness: 0.6, draw: laminate },
  { id: 'floor-tile', label: 'Плитка (базовая)', category: 'floor', tileMeters: 0.8, roughness: 0.4, draw: tile },
  { id: 'floor-carpet', label: 'Ковролин (базовый)', category: 'floor', tileMeters: 1.5, roughness: 1, draw: carpet },
  { id: 'wall-concrete', label: 'Бетон (базовый)', category: 'wall', tileMeters: 2, roughness: 0.95, draw: concrete },
  { id: 'wall-brick', label: 'Кирпич (базовый)', category: 'wall', tileMeters: 1.2, roughness: 0.95, draw: brick },
  { id: 'wall-wallpaper', label: 'Обои (базовые)', category: 'wall', tileMeters: 1, roughness: 0.85, draw: wallpaper },
  { id: 'ceil-concrete', label: 'Бетон (базовый)', category: 'ceiling', tileMeters: 2.5, roughness: 0.95, draw: lightConcrete },
];
