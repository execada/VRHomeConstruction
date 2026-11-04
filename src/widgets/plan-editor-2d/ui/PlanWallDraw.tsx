/**
 * Рисование внутренних стен на плане: прозрачный слой поверх плана принимает клики
 * (начало и конец стены), показывает «призрак» стены, длину и маркер привязки.
 * Правая кнопка или Esc — закончить цепочку стен.
 * @module widgets/plan-editor-2d/ui/PlanWallDraw
 */

import React, { useRef } from 'react';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useWallDrawing } from '@/features/editor-3d/model/useWallDrawing';
import { useExternalStore } from '@/shared/lib/externalStore';
import { length2, sub2 } from '@/shared/lib/math/geometry2d';
import { formatMeters } from '@/shared/lib/units';
import { footprintPoints } from '../lib/plan';
import { clientToSvg } from '../model/useSvgInteraction';
import styles from './PlanEditor2D.module.scss';

const CLICK_PX = 5;
const GHOST_HALF = 0.05;

const DraftShape: React.FC = () => {
  const draft = useExternalStore(interactionStore, (s) => s.wallDraft);
  if (!draft) return null;
  const { start, cursor } = draft;
  const length = start ? length2(sub2(cursor, start)) : 0;
  const angle = start ? Math.atan2(-(cursor[1] - start[1]), cursor[0] - start[0]) : 0;
  return (
    <g pointerEvents="none">
      {start && length > 1e-3 && (
        <>
          <polygon
            points={footprintPoints({ center: [(start[0] + cursor[0]) / 2, (start[1] + cursor[1]) / 2], half: [length / 2, GHOST_HALF], angle })}
            className={styles.draftWall}
            vectorEffect="non-scaling-stroke"
          />
          <text x={(start[0] + cursor[0]) / 2} y={(start[1] + cursor[1]) / 2 - 0.18} fontSize={0.18} className={styles.dimension}>
            {formatMeters(length)}
          </text>
        </>
      )}
      <circle cx={cursor[0]} cy={cursor[1]} r={0.08} className={styles.snapMarker} vectorEffect="non-scaling-stroke" data-snap={draft.snap} />
    </g>
  );
};

export const PlanWallDraw: React.FC<{ svg: React.RefObject<SVGSVGElement | null> }> = ({ svg }) => {
  const drawing = useWallDrawing();
  const down = useRef<{ x: number; y: number } | null>(null);
  const point = (e: React.PointerEvent) => clientToSvg(svg.current, e.clientX, e.clientY);

  return (
    <>
      <rect
        x={-1000}
        y={-1000}
        width={2000}
        height={2000}
        className={styles.drawLayer}
        onPointerMove={(e) => {
          const p = point(e);
          if (p) drawing.hover(p);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 2) drawing.finish();
          if (e.button === 0) down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = down.current;
          down.current = null;
          if (e.button !== 0 || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_PX) return;
          const p = point(e);
          if (p) drawing.click(p);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <DraftShape />
    </>
  );
};
