/**
 * Проём на плане: проём в толще стены, у двери — дуга открывания, у окна — линии стекла.
 * @module widgets/plan-editor-2d/ui/PlanOpening
 */

import React from 'react';
import cn from 'classnames';
import { add2, scale2, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { WallFrame } from '@/features/editor-3d/lib/walls';
import type { Opening } from '@/features/editor-3d/types';
import { footprintPoints } from '../lib/plan';
import styles from './PlanEditor2D.module.scss';

interface PlanOpeningProps {
  frame: WallFrame;
  opening: Opening;
  thickness: number;
  /** Смещение оси стены от рабочей грани вдоль нормали (у внешних стен — внутрь стены) */
  faceOffset: number;
  selected: boolean;
  handlers: React.SVGProps<SVGPolygonElement>;
}

const pt = (p: Vec2) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

export const PlanOpening: React.FC<PlanOpeningProps> = ({ frame, opening, thickness, faceOffset, selected, handlers }) => {
  const u = opening.position[0];
  const w = opening.width;
  const center = add2(add2(frame.origin, scale2(frame.tangent, u)), scale2(frame.normal, faceOffset));
  const poly = footprintPoints({ center, half: [w / 2, thickness / 2 + 0.01], angle: frame.rotationY });
  const face = add2(frame.origin, scale2(frame.tangent, u));
  const hinge = add2(face, scale2(frame.tangent, -w / 2));
  const tip = add2(hinge, scale2(frame.normal, w));
  const end = add2(face, scale2(frame.tangent, w / 2));
  const lineA = add2(center, scale2(frame.normal, -thickness / 6));
  const lineB = add2(center, scale2(frame.normal, thickness / 6));
  const half = scale2(frame.tangent, w / 2);
  // Направление дуги от створки к проёму: знак векторного произведения в экранных осях SVG.
  const sweep = frame.normal[0] * frame.tangent[1] - frame.normal[1] * frame.tangent[0] > 0 ? 1 : 0;

  return (
    <g>
      <polygon points={poly} className={cn(styles.opening, selected && styles.openingSelected)} vectorEffect="non-scaling-stroke" {...handlers}>
        <title>{opening.type === 'door' ? 'Дверь' : 'Окно'}: перетащите вдоль стены</title>
      </polygon>
      {opening.type === 'door' ? (
        <path d={`M ${pt(end)} L ${pt(hinge)} L ${pt(tip)} A ${w} ${w} 0 0 ${sweep} ${pt(end)}`} className={styles.doorArc} vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <line x1={add2(lineA, scale2(half, -1))[0]} y1={add2(lineA, scale2(half, -1))[1]} x2={add2(lineA, half)[0]} y2={add2(lineA, half)[1]} className={styles.windowLine} vectorEffect="non-scaling-stroke" />
          <line x1={add2(lineB, scale2(half, -1))[0]} y1={add2(lineB, scale2(half, -1))[1]} x2={add2(lineB, half)[0]} y2={add2(lineB, half)[1]} className={styles.windowLine} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </g>
  );
};
