/**
 * Где показать всплывающую подсказку у элемента: с нужной стороны, а если там не помещается —
 * с противоположной; в любом случае целиком в окне.
 * @module hints/lib/bubblePosition
 */

import type { HintPlacement } from './hintCatalog';

/** Прямоугольник на экране, px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Отступ подсказки от элемента и от краёв окна, px. */
const GAP = 12;
const MARGIN = 8;

const OPPOSITE: Record<HintPlacement, HintPlacement> = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };

function place(target: Box, size: { width: number; height: number }, side: HintPlacement): { left: number; top: number } {
  const centerX = target.left + target.width / 2 - size.width / 2;
  const centerY = target.top + target.height / 2 - size.height / 2;
  if (side === 'right') return { left: target.left + target.width + GAP, top: centerY };
  if (side === 'left') return { left: target.left - GAP - size.width, top: centerY };
  if (side === 'top') return { left: centerX, top: target.top - GAP - size.height };
  return { left: centerX, top: target.top + target.height + GAP };
}

const fits = (p: { left: number; top: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) =>
  p.left >= MARGIN && p.top >= MARGIN && p.left + size.width <= viewport.width - MARGIN && p.top + size.height <= viewport.height - MARGIN;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Положение подсказки.
 * @param target - элемент, к которому она привязана
 * @param size - размер подсказки
 * @param side - желаемая сторона
 * @param viewport - размер окна
 */
export function bubblePosition(
  target: Box,
  size: { width: number; height: number },
  side: HintPlacement,
  viewport: { width: number; height: number },
): { left: number; top: number; side: HintPlacement } {
  const preferred = place(target, size, side);
  const flipped = place(target, size, OPPOSITE[side]);
  const chosen = fits(preferred, size, viewport) || !fits(flipped, size, viewport) ? { ...preferred, side } : { ...flipped, side: OPPOSITE[side] };
  return {
    left: clamp(chosen.left, MARGIN, viewport.width - size.width - MARGIN),
    top: clamp(chosen.top, MARGIN, viewport.height - size.height - MARGIN),
    side: chosen.side,
  };
}
