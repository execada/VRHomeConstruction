/**
 * Штриховки материалов стен на плане (SVG-паттерны, по мотивам ГОСТ 2.306):
 * кирпич — косая штриховка, газобетон — точки, пеноблок — сетка, бетон — крапинки,
 * железобетон — штриховка с точками, гипсокартон — светлая заливка, брус — обратная штриховка.
 * Паттерны строятся из реестра материалов, поэтому новый материал сразу получает штриховку.
 * Единицы — метры (как у плана).
 * @module widgets/plan-editor-2d/ui/PlanHatches
 */

import React, { memo } from 'react';
import { WALL_MATERIALS, type PlanHatch, type WallMaterialDef } from '@/features/editor-3d/lib/wallMaterials';
import { hatchId } from '../lib/hatch';

const STEP = 0.07;
const LINE = 0.008;

const Lines: React.FC<{ ink: string; cross?: boolean }> = ({ ink, cross }) => (
  <>
    <path d={`M0 0V${STEP}`} stroke={ink} strokeWidth={LINE} />
    {cross && <path d={`M0 ${STEP / 2}H${STEP}`} stroke={ink} strokeWidth={LINE} />}
  </>
);

const Dots: React.FC<{ ink: string; points: ReadonlyArray<readonly [number, number]>; r: number }> = ({ ink, points, r }) => (
  <>
    {points.map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x * STEP} cy={y * STEP} r={r} fill={ink} />
    ))}
  </>
);

const SPECKLES = [[0.2, 0.3], [0.7, 0.15], [0.55, 0.65], [0.15, 0.85], [0.85, 0.8]] as const;

/** Рисунок внутри ячейки паттерна. */
function hatchContent(kind: PlanHatch, ink: string): React.ReactNode {
  switch (kind) {
    case 'diagonal':
    case 'diagonalReverse':
      return <Lines ink={ink} />;
    case 'cross':
      return <Lines ink={ink} cross />;
    case 'dots':
      return <Dots ink={ink} points={[[0.5, 0.5]]} r={0.007} />;
    case 'speckle':
      return <Dots ink={ink} points={SPECKLES} r={0.005} />;
    case 'reinforced':
      return (
        <>
          <Lines ink={ink} />
          <Dots ink={ink} points={[[0.5, 0.5]]} r={0.006} />
        </>
      );
    default:
      return null;
  }
}

const ROTATION: Partial<Record<PlanHatch, number>> = { diagonal: 45, diagonalReverse: -45, cross: 45, reinforced: 45 };

const Hatch: React.FC<{ def: WallMaterialDef }> = ({ def }) => (
  <pattern
    id={hatchId(def.id)}
    patternUnits="userSpaceOnUse"
    width={STEP}
    height={STEP}
    patternTransform={ROTATION[def.plan.hatch] ? `rotate(${ROTATION[def.plan.hatch]})` : undefined}
  >
    <rect width={STEP} height={STEP} fill={def.plan.fill} />
    {hatchContent(def.plan.hatch, def.plan.ink)}
  </pattern>
);

/** Определения штриховок (один раз внутри SVG плана). */
export const PlanHatches: React.FC = memo(() => (
  <defs>
    {WALL_MATERIALS.map((def) => (
      <Hatch key={def.id} def={def} />
    ))}
  </defs>
));
