/**
 * Проём на плане: проём в толще стены, у двери — полотно и дуга открывания (по петлям
 * и стороне открывания установленной двери; у пустого проёма — без полотна), у окна — линии стекла.
 * @module widgets/plan-editor-2d/ui/PlanOpening
 */

import React from 'react';
import cn from 'classnames';
import { add2, scale2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { doorLeaves, type DoorSpec } from '@/features/editor-3d/lib/doors';
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

/** Створки двери на плане: полотно, открытое на 90°, и дуга от притвора. */
const DoorSymbol: React.FC<{ frame: WallFrame; u: number; faceOffset: number; door: DoorSpec; size: { width: number; height: number }; thickness: number }> = ({
  frame,
  u,
  faceOffset,
  door,
  size,
  thickness,
}) => {
  const local = (x: number, z: number) => add2(add2(frame.origin, scale2(frame.tangent, u + x)), scale2(frame.normal, faceOffset + z));
  const swing = door.swing === 'front' ? 1 : -1;
  return (
    <>
      {doorLeaves(size, door, thickness).map((leaf, i) => {
        const hinge = local(leaf.hinge[0], leaf.hinge[1]);
        const latch = local(leaf.hinge[0] + leaf.toLatch * leaf.width, leaf.hinge[1]);
        const tip = local(leaf.hinge[0], leaf.hinge[1] + swing * leaf.width);
        const l = [latch[0] - hinge[0], latch[1] - hinge[1]];
        const t = [tip[0] - hinge[0], tip[1] - hinge[1]];
        const sweep = l[0] * t[1] - l[1] * t[0] > 0 ? 1 : 0;
        return (
          <g key={i}>
            <path d={`M ${pt(latch)} A ${leaf.width} ${leaf.width} 0 0 ${sweep} ${pt(tip)}`} className={styles.doorArc} vectorEffect="non-scaling-stroke" />
            <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} className={styles.doorLeaf} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </>
  );
};

export const PlanOpening: React.FC<PlanOpeningProps> = ({ frame, opening, thickness, faceOffset, selected, handlers }) => {
  const u = opening.position[0];
  const w = opening.width;
  const center = add2(add2(frame.origin, scale2(frame.tangent, u)), scale2(frame.normal, faceOffset));
  const poly = footprintPoints({ center, half: [w / 2, thickness / 2 + 0.01], angle: frame.rotationY });
  const lineA = add2(center, scale2(frame.normal, -thickness / 6));
  const lineB = add2(center, scale2(frame.normal, thickness / 6));
  const half = scale2(frame.tangent, w / 2);
  const title = opening.type === 'window' ? 'Окно' : opening.door ? 'Дверь' : 'Дверной проём';

  return (
    <g>
      <polygon points={poly} className={cn(styles.opening, selected && styles.openingSelected)} vectorEffect="non-scaling-stroke" {...handlers}>
        <title>{`${title}: перетащите вдоль стены`}</title>
      </polygon>
      {opening.type === 'door' ? (
        opening.door && <DoorSymbol frame={frame} u={u} faceOffset={faceOffset} door={opening.door} size={opening} thickness={thickness} />
      ) : (
        <>
          <line x1={add2(lineA, scale2(half, -1))[0]} y1={add2(lineA, scale2(half, -1))[1]} x2={add2(lineA, half)[0]} y2={add2(lineA, half)[1]} className={styles.windowLine} vectorEffect="non-scaling-stroke" />
          <line x1={add2(lineB, scale2(half, -1))[0]} y1={add2(lineB, scale2(half, -1))[1]} x2={add2(lineB, half)[0]} y2={add2(lineB, half)[1]} className={styles.windowLine} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </g>
  );
};
