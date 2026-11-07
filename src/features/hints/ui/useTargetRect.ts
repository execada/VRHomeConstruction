/**
 * Прямоугольник элемента интерфейса по CSS-селектору: обновляется несколько раз в секунду и при
 * изменении окна — подсказка едет за элементом, когда меняется ширина панелей или вкладка.
 * @module hints/ui/useTargetRect
 */

import { useEffect, useState } from 'react';
import type { Box } from '../lib/bubblePosition';

const INTERVAL_MS = 250;

/**
 * Видимая в окне часть элемента (null — элемента нет или он за пределами окна): высокий каталог
 * с прокруткой даёт подсказке середину своей видимой части, а не точку под нижним краем экрана.
 */
export function rectOf(selector: string): Box | null {
  const r = document.querySelector(selector)?.getBoundingClientRect();
  if (!r) return null;
  const left = Math.max(r.left, 0);
  const top = Math.max(r.top, 0);
  const right = Math.min(r.right, window.innerWidth);
  const bottom = Math.min(r.bottom, window.innerHeight);
  return right - left > 0 && bottom - top > 0 ? { left, top, width: right - left, height: bottom - top } : null;
}

const same = (a: Box | null, b: Box | null) =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/**
 * Прямоугольник элемента.
 * @param selector - CSS-селектор (null — не отслеживать)
 * @returns null — элемента нет на экране
 */
export function useTargetRect(selector: string | null): Box | null {
  const [rect, setRect] = useState<Box | null>(() => (selector ? rectOf(selector) : null));
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const next = rectOf(selector);
      setRect((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    const timer = window.setInterval(measure, INTERVAL_MS);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [selector]);
  return rect;
}

/** Перерисовка раз в interval мс, пока active (подсказки ждут появления элементов). */
export function useTicker(intervalMs: number, active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);
  return tick;
}
