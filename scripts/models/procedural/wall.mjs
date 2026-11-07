/**
 * Настенные предметы: полка из дуба на скрытых кронштейнах и сплит-кондиционер.
 * Задняя грань модели — плоскость стены (z = -глубина/2), фасад смотрит в +Z, низ на y = 0.
 */

import { box, ModelBuilder } from './geometry.mjs';
import { M } from './materials.mjs';

/** Полка из дуба 80 × 22 см на двух чёрных кронштейнах (уголках). */
export function wallShelf() {
  const [width, depth, board, bracket] = [0.8, 0.22, 0.035, 0.16];
  const b = new ModelBuilder();
  b.add(M.oak, box(width, board, depth, 0.004), { at: [0, bracket + board / 2, 0] });
  for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
    // Вертикальная планка на стене и горизонтальная под доской
    b.add(M.blackMetal, box(0.03, bracket, 0.008, 0.002), { at: [x, bracket / 2, -depth / 2 + 0.004] });
    b.add(M.blackMetal, box(0.03, 0.008, depth - 0.03, 0.002), { at: [x, bracket - 0.004, -depth / 2 + 0.008 + (depth - 0.03) / 2] });
  }
  return b;
}

/** Настенный сплит-кондиционер 80 × 28 × 20 см: белый корпус, жалюзи снизу, индикатор. */
export function splitAirConditioner() {
  const [width, height, depth] = [0.8, 0.28, 0.2];
  const b = new ModelBuilder();
  b.add(M.plasticWhite, box(width, height, depth, 0.03), { at: [0, height / 2, 0] });
  b.add(M.blackGlass, box(width - 0.08, 0.035, 0.02, 0.006), { at: [0, 0.045, depth / 2 - 0.004] });
  b.add(M.plasticWhite, box(width - 0.1, 0.02, 0.05, 0.004), { at: [0, 0.05, depth / 2 + 0.005], rotate: [-0.5, 0, 0] });
  b.add(M.display, box(0.05, 0.012, 0.002, 0), { at: [width / 2 - 0.12, height - 0.07, depth / 2 + 0.001] });
  return b;
}
