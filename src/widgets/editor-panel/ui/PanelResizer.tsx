/**
 * Разделитель на правом краю левой панели: потянуть мышью или пальцем — шире или уже,
 * стрелки ← → — по шагу, Home / End — к пределам, двойной клик — исходная ширина.
 * @module widgets/editor-panel/ui/PanelResizer
 */

import React, { useRef, useState } from 'react';
import cn from 'classnames';
import { keyboardWidth, PANEL_WIDTH } from '../lib/panelWidth';
import styles from './EditorPanel.module.scss';

interface PanelResizerProps {
  width: number;
  onChange: (width: number) => void;
  onReset: () => void;
}

export const PanelResizer: React.FC<PanelResizerProps> = ({ width, onChange, onReset }) => {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    setActive(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    // Разделитель с aria-valuenow — фокусируемый элемент управления (WAI-ARIA window splitter).
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина панели"
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину панели · двойной клик — исходная ширина"
      className={cn(styles.resizer, active && styles.resizerActive)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, width };
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(drag.current.width + e.clientX - drag.current.x);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const next = keyboardWidth(e.key, width);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
      }}
    />
  );
};
