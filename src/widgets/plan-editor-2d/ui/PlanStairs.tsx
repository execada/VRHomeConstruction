/**
 * Лестницы на плане: марш со ступенями и стрелкой подъёма, перетаскивание и выделение
 * (ограничения те же, что в 3D — см. команды лестниц). Проём в полу над лестницей
 * с этажа ниже показан пунктиром: туда ничего не ставится.
 * @module widgets/plan-editor-2d/ui/PlanStairs
 */

import React, { memo, useMemo } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { stairFootprint, stairLayout } from '@/features/editor-3d/lib/stairs/stairs';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import type { Stair } from '@/features/editor-3d/types';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { add2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { footprintPoints, rectPoints, stairPlanLines } from '../lib/plan';
import { useSvgDrag } from '../model/useSvgInteraction';
import styles from './PlanEditor2D.module.scss';

type SvgRef = React.RefObject<SVGSVGElement | null>;

/** Марш на плане: контур, ступени, стрелка подъёма. */
export const StairShape: React.FC<{ stair: Stair; rise: number; className?: string; handlers?: Record<string, unknown> }> = memo(
  ({ stair, rise, className, handlers }) => {
    const layout = useMemo(() => stairLayout(stair.kind, rise, stair.width), [stair.kind, rise, stair.width]);
    const lines = useMemo(() => stairPlanLines(stair, layout), [stair, layout]);
    const [from, to] = lines.arrow;
    return (
      <g>
        <polygon points={footprintPoints(stairFootprint(stair, layout))} className={className} vectorEffect="non-scaling-stroke" {...handlers} />
        {lines.treads.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={styles.stairTread} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={styles.stairArrow} vectorEffect="non-scaling-stroke" markerEnd="url(#plan-stair-arrow)" />
      </g>
    );
  },
);

const PlanStair: React.FC<{ svg: SvgRef; stair: Stair; rise: number; selected: boolean }> = ({ svg, stair, rise, selected }) => {
  const commands = useSceneCommands();
  const drag = useSvgDrag<{ offset: Vec2 }>({
    svg,
    onStart: (point) => {
      commands.select({ kind: 'stair', id: stair.id });
      return { offset: sub2(stair.position, point) };
    },
    onMove: (point, ctx) => {
      commands.stairs.move(stair.id, add2(point, ctx.offset));
    },
  });
  return (
    <g>
      <title>Лестница: перетащите, чтобы сдвинуть · R — повернуть на 90°</title>
      <StairShape stair={stair} rise={rise} className={cn(styles.stair, selected && styles.stairSelected)} handlers={drag} />
    </g>
  );
};

export const PlanStairs: React.FC<{ svg: SvgRef }> = ({ svg }) => {
  const stairs = useSelector(editorSelectors.selectStairs);
  const rise = useSelector(buildingSelectors.selectActiveRise);
  const cutouts = useSelector(buildingSelectors.selectCutoutsFromBelow);
  const selection = useSelector(selectionSelectors.selectSelection);
  return (
    <g>
      <defs>
        <marker id="plan-stair-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className={styles.stairArrowHead} />
        </marker>
      </defs>
      {cutouts.map((r, i) => (
        <polygon key={i} points={rectPoints(r)} className={styles.cutout} vectorEffect="non-scaling-stroke" pointerEvents="none">
          <title>Проём лестницы с этажа ниже</title>
        </polygon>
      ))}
      {stairs.map((s) => (
        <PlanStair key={s.id} svg={svg} stair={s} rise={rise} selected={selection?.kind === 'stair' && selection.id === s.id} />
      ))}
    </g>
  );
};
