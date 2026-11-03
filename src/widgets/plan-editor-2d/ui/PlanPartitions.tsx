/**
 * Внутренние стены на плане: контуры с учётом стыков (штриховка материала), перетаскивание
 * тела, ручки концов с привязкой к стенам (Shift — без привязки), проёмы вдоль оси стены.
 * @module widgets/plan-editor-2d/ui/PlanPartitions
 */

import React from 'react';
import cn from 'classnames';
import { useSelector, useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import { selectWallLayout } from '@/features/editor-3d/layoutSelectors';
import { fromAxisLocal, wallAxis } from '@/features/editor-3d/lib/wallAxes';
import type { InteriorWallShape } from '@/features/editor-3d/lib/wallJoints';
import { snapWallPoint } from '@/features/editor-3d/lib/wallSnap';
import { GRID_STEP, interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { partitionEndpoints, partitionMaterial } from '@/features/editor-3d/lib/partitions';
import { partitionFrame } from '@/features/editor-3d/lib/walls';
import type { Opening, Partition } from '@/features/editor-3d/types';
import { add2, dot2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { hatchFill } from '../lib/hatch';
import { polygonPoints } from '../lib/plan';
import { useSvgDrag } from '../model/useSvgInteraction';
import { PlanOpening } from './PlanOpening';
import styles from './PlanEditor2D.module.scss';

type SvgRef = React.RefObject<SVGSVGElement | null>;

const EndHandle: React.FC<{ svg: SvgRef; partition: Partition; end: 0 | 1 }> = ({ svg, partition, end }) => {
  const commands = useSceneCommands();
  const store = useStore<RootState>();
  const points = partitionEndpoints(partition);
  const drag = useSvgDrag<{ fixed: Vec2 }>({
    svg,
    onStart: () => ({ fixed: points[end === 0 ? 1 : 0] }),
    onMove: (point, ctx, e) => {
      const { editor } = store.getState();
      const grid = interactionStore.getState().gridEnabled ? GRID_STEP : null;
      const snapped = e.shiftKey
        ? point
        : snapWallPoint(point, editor.dimensions, editor.partitions, { from: ctx.fixed, grid, excludeId: partition.id }).point;
      commands.partitions.setEndpoints(partition.id, end === 0 ? snapped : ctx.fixed, end === 0 ? ctx.fixed : snapped);
    },
    onEnd: () => commands.partitions.endGesture(),
  });
  return <circle cx={points[end][0]} cy={points[end][1]} r={0.09} className={styles.handle} vectorEffect="non-scaling-stroke" {...drag} />;
};

const PartitionOpening: React.FC<{ svg: SvgRef; partition: Partition; opening: Opening; selected: boolean }> = ({ svg, partition, opening, selected }) => {
  const commands = useSceneCommands();
  const frame = partitionFrame(partition);
  const drag = useSvgDrag<{ offset: number }>({
    svg,
    onStart: (point) => {
      commands.select({ kind: 'opening', hostId: partition.id, id: opening.id });
      return { offset: opening.position[0] - dot2(sub2(point, frame.origin), frame.tangent) };
    },
    onMove: (point, ctx) =>
      commands.openings.move(partition.id, opening.id, { u: dot2(sub2(point, frame.origin), frame.tangent) + ctx.offset, y: opening.position[1] }),
  });
  return <PlanOpening frame={frame} opening={opening} thickness={partition.size[2]} faceOffset={0} selected={selected} handlers={drag} />;
};

/** Контуры участков стены в мировых координатах. */
function outlines(partition: Partition, shape: InteriorWallShape | undefined): string[] {
  const axis = wallAxis(partition);
  return (shape?.spans ?? []).map((span) => polygonPoints(span.polygon.map((p) => fromAxisLocal(axis, p))));
}

const PlanPartition: React.FC<{
  svg: SvgRef;
  partition: Partition;
  shape: InteriorWallShape | undefined;
  selected: boolean;
  selectedOpeningId: string | null;
}> = ({ svg, partition, shape, selected, selectedOpeningId }) => {
  const commands = useSceneCommands();
  const drag = useSvgDrag<{ offset: Vec2 }>({
    svg,
    onStart: (point) => {
      commands.select({ kind: 'partition', id: partition.id });
      return { offset: sub2([partition.position[0], partition.position[2]], point) };
    },
    onMove: (point, ctx) => commands.partitions.move(partition.id, add2(point, ctx.offset)),
    onEnd: () => commands.partitions.endGesture(),
  });
  return (
    <g>
      {outlines(partition, shape).map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill={hatchFill(partitionMaterial(partition))}
          className={cn(styles.partition, selected && styles.partitionSelected)}
          vectorEffect="non-scaling-stroke"
          {...drag}
        >
          <title>Внутренняя стена: перетащите; концы — длина и поворот (Shift — без привязки)</title>
        </polygon>
      ))}
      {partition.openings.map((o) => (
        <PartitionOpening key={o.id} svg={svg} partition={partition} opening={o} selected={o.id === selectedOpeningId} />
      ))}
      {selected && (
        <>
          <EndHandle svg={svg} partition={partition} end={0} />
          <EndHandle svg={svg} partition={partition} end={1} />
        </>
      )}
    </g>
  );
};

export const PlanPartitions: React.FC<{ svg: SvgRef }> = ({ svg }) => {
  const partitions = useSelector(editorSelectors.selectPartitions);
  const layout = useSelector(selectWallLayout);
  const selection = useSelector(selectionSelectors.selectSelection);
  return (
    <g>
      {partitions.map((p) => (
        <PlanPartition
          key={p.id}
          svg={svg}
          partition={p}
          shape={layout.interior[p.id]}
          selected={selection?.kind === 'partition' && selection.id === p.id}
          selectedOpeningId={selection?.kind === 'opening' ? selection.id : null}
        />
      ))}
    </g>
  );
};
