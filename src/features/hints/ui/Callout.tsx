/**
 * Всплывающая карточка у элемента интерфейса (подсказка или шаг обучения): с нужной стороны,
 * с уголком к элементу и целиком в окне; без элемента — по центру экрана.
 * @module hints/ui/Callout
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import cn from 'classnames';
import { bubblePosition, type Box } from '../lib/bubblePosition';
import type { HintPlacement } from '../lib/hintCatalog';
import styles from './hints.module.scss';

interface CalloutProps {
  /** Элемент (null — карточка по центру экрана) */
  target: Box | null;
  placement: HintPlacement;
  title: string;
  text: string;
  /** Подпись для экранного диктора */
  label: string;
  className?: string;
  children?: React.ReactNode;
}

/** Отступ уголка от краёв карточки, px. */
const ARROW_INSET = 16;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export const Callout: React.FC<CalloutProps> = ({ target, placement, title, text, label, className, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 280, height: 140 });

  // Размер карточки известен только после отрисовки и меняется вместе с текстом шага.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const next = { width: el.offsetWidth, height: el.offsetHeight };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const pos = target
    ? bubblePosition(target, size, placement, viewport)
    : { left: (viewport.width - size.width) / 2, top: (viewport.height - size.height) / 2, side: null };
  const arrow =
    target && pos.side
      ? pos.side === 'left' || pos.side === 'right'
        ? clamp(target.top + target.height / 2 - pos.top, ARROW_INSET, size.height - ARROW_INSET)
        : clamp(target.left + target.width / 2 - pos.left, ARROW_INSET, size.width - ARROW_INSET)
      : 0;
  const style = { left: pos.left, top: pos.top, '--arrow': `${arrow}px` } as React.CSSProperties;

  return createPortal(
    <div ref={ref} role="note" aria-label={label} className={cn(styles.bubble, pos.side && styles[pos.side], className)} style={style}>
      <strong className={styles.title}>{title}</strong>
      <p className={styles.text}>{text}</p>
      {children}
    </div>,
    document.body,
  );
};
