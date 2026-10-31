/**
 * Взаимодействие с SVG 2D-редактора: перевод экранных координат в метры,
 * перетаскивание элементов с захватом указателя, масштаб колесом и панорама фона.
 * @module widgets/plan-editor-2d/model/useSvgInteraction
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { interaction } from '@/features/editor-3d/model/interactionStore';
import { zoomViewBox, type ViewBox } from '../lib/plan';

/** Перевести экранную точку в координаты SVG (метры). */
export function clientToSvg(svg: SVGSVGElement | null, clientX: number, clientY: number): Vec2 | null {
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return [point.x, point.y];
}

interface SvgDragOptions<C> {
  svg: React.RefObject<SVGSVGElement | null>;
  onStart: (point: Vec2, e: React.PointerEvent) => C | null;
  onMove: (point: Vec2, context: C, e: React.PointerEvent) => void;
  onEnd?: (context: C) => void;
}

/** Обработчики перетаскивания элемента SVG. */
export function useSvgDrag<C>(options: SvgDragOptions<C>) {
  const latest = useRef(options);
  latest.current = options;
  const context = useRef<C | null>(null);

  return useMemo(() => {
    const end = (e: React.PointerEvent) => {
      if (context.current === null) return;
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      const ctx = context.current;
      context.current = null;
      interaction.reset();
      latest.current.onEnd?.(ctx);
    };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const point = clientToSvg(latest.current.svg.current, e.clientX, e.clientY);
        if (!point) return;
        e.stopPropagation();
        const ctx = latest.current.onStart(point, e);
        if (ctx === null) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        context.current = ctx;
        // Жест на плане: история склеивает его в один шаг отмены.
        interaction.startGesture('dragging', 'plan-2d');
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (context.current === null) return;
        const point = clientToSvg(latest.current.svg.current, e.clientX, e.clientY);
        if (point) latest.current.onMove(point, context.current, e);
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  }, []);
}

/**
 * Рамка вида с масштабом колесом (вокруг курсора) и панорамой перетаскиванием фона.
 * @param svg - элемент SVG
 * @param fit - рамка «показать всё»; при её изменении вид сбрасывается
 */
export function useSvgViewport(svg: React.RefObject<SVGSVGElement | null>, fit: ViewBox) {
  const [view, setView] = useState(fit);
  const pan = useRef<{ start: Vec2; view: ViewBox } | null>(null);
  const fitKey = `${fit.x}|${fit.y}|${fit.width}|${fit.height}`;

  // Новая рамка «показать всё» (изменились размеры комнаты или стена) — сбросить вид.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setView(fit), [fitKey]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const focus = clientToSvg(el, e.clientX, e.clientY);
      if (!focus) return;
      setView((v) => zoomViewBox(v, focus, e.deltaY > 0 ? 1.12 : 1 / 1.12, { min: 0.5, max: fit.width * 4 }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svg, fit.width]);

  const panHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      pan.current = { start: [e.clientX, e.clientY], view };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pan.current;
      const rect = svg.current?.getBoundingClientRect();
      if (!p || !rect || rect.width === 0) return;
      const k = Math.max(p.view.width / rect.width, p.view.height / rect.height);
      setView({ ...p.view, x: p.view.x - (e.clientX - p.start[0]) * k, y: p.view.y - (e.clientY - p.start[1]) * k });
    },
    onPointerUp: () => {
      pan.current = null;
    },
  };

  const reset = useCallback((next?: ViewBox) => setView(next ?? fit), [fit]);
  /** Сдвинуть вид (например, чтобы неподвижная стена оставалась на месте при изменении комнаты). */
  const shift = useCallback((d: Vec2) => setView((v) => ({ ...v, x: v.x + d[0], y: v.y + d[1] })), []);
  return { viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`, panHandlers, reset, shift, view };
}
