/**
 * Ширина левой панели редактора (каталог, комната, отделка, свет, вид): пределы, шаг клавишами
 * и ограничение по окну — панель не сжимает сцену в узкую щель.
 * @module widgets/editor-panel/lib/panelWidth
 */

/** Пределы и шаг ширины содержимого панели, px. */
export const PANEL_WIDTH = { min: 260, max: 560, initial: 300, step: 16 } as const;

/** Больше этой доли окна панель не занимает. */
const MAX_WINDOW_SHARE = 0.45;

/**
 * Ширина панели в пределах: не уже минимума и не шире максимума и доли окна.
 * @param width - желаемая ширина, px
 * @param windowWidth - ширина окна браузера, px
 */
export function clampPanelWidth(width: number, windowWidth: number): number {
  const max = Math.max(PANEL_WIDTH.min, Math.min(PANEL_WIDTH.max, Math.floor(windowWidth * MAX_WINDOW_SHARE)));
  const safe = Number.isFinite(width) ? width : PANEL_WIDTH.initial;
  return Math.round(Math.min(max, Math.max(PANEL_WIDTH.min, safe)));
}

/**
 * Ширина после нажатия клавиши на разделителе (← и → — шаг, Home и End — пределы).
 * @returns null — клавиша ширину не меняет
 */
export function keyboardWidth(key: string, width: number): number | null {
  if (key === 'ArrowLeft') return width - PANEL_WIDTH.step;
  if (key === 'ArrowRight') return width + PANEL_WIDTH.step;
  if (key === 'Home') return PANEL_WIDTH.min;
  if (key === 'End') return PANEL_WIDTH.max;
  return null;
}
