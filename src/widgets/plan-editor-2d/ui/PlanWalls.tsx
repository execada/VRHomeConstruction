/**
 * Стены и проёмы внешних стен на плане. Перетаскивание стены меняет размер комнаты,
 * противоположная стена при этом остаётся на месте (вид сдвигается вместе с комнатой).
 * Проёмы перетаскиваются вдоль стены.
 * @module widgets/plan-editor-2d/ui/PlanWalls
 */

import React from 'react';
import cn from 'classnames';
import { useSelector, useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { wallBox, wallFrame, WALL_SIDES, type WallFrame } from '@/features/editor-3d/lib/walls';
import type { Opening, WallSide } from '@/features/editor-3d/types';
import { dot2, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { footprintPoints } from '../lib/plan';
import { useSvgDrag } from '../model/useSvgInteraction';
import { PlanOpening } from './PlanOpening';
import styles from './PlanEditor2D.module.scss';

interface PlanWallsProps {
  svg: React.RefObject<SVGSVGElement | null>;
  /** Сдвинуть вид (компенсация перецентровки комнаты при перетаскивании стены) */
  shiftView: (shift: Vec2) => void;
}

const DragWall: React.FC<PlanWallsProps & { side: WallSide; selected: boolean; viewed: boolean }> = ({ svg, shiftView, side, selected, viewed }) => {
  const store = useStore<RootState>();
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const thickness = useSelector(editorSelectors.selectWallThickness);
  const box = wallBox(side, dims, thickness);
  const along = side === 'left' || side === 'right' ? 'width' : 'depth';

  const drag = useSvgDrag<{ side: WallSide }>({
    svg,
    onStart: () => {
      commands.select({ kind: 'wall', side });
      return { side };
    },
    onMove: (point) => {
      const before = store.getState().editor.dimensions;
      const frame = wallFrame(side, before);
      const outward = scale2(frame.normal, -1);
      const delta = dot2(point, outward) - dot2(frame.origin, outward);
      if (Math.abs(delta) < 0.005) return;
      commands.room.dragWall(side, delta);
      const actual = store.getState().editor.dimensions[along] - before[along];
      shiftView(scale2(frame.normal, actual / 2));
    },
  });

  return (
    <polygon
      points={footprintPoints({ center: box.base, half: [box.length / 2, thickness / 2], angle: box.rotationY })}
      className={cn(styles.wall, along === 'depth' && styles.wallVertical, selected && styles.wallSelected, viewed && styles.wallViewed)}
      vectorEffect="non-scaling-stroke"
      {...drag}
    >
      <title>{`Стена: перетащите, чтобы изменить ${along === 'width' ? 'ширину' : 'глубину'} комнаты`}</title>
    </polygon>
  );
};

/** Проём внешней стены с перетаскиванием вдоль неё. */
const WallOpening: React.FC<{ svg: PlanWallsProps['svg']; side: WallSide; frame: WallFrame; opening: Opening; thickness: number; selected: boolean }> = ({
  svg,
  side,
  frame,
  opening,
  thickness,
  selected,
}) => {
  const commands = useSceneCommands();
  const drag = useSvgDrag<{ offset: number }>({
    svg,
    onStart: (point) => {
      commands.select({ kind: 'opening', hostId: side, id: opening.id });
      return { offset: opening.position[0] - dot2(sub2(point, frame.origin), frame.tangent) };
    },
    onMove: (point, ctx) => {
      const u = dot2(sub2(point, frame.origin), frame.tangent) + ctx.offset;
      commands.openings.move(side, opening.id, { u, y: opening.position[1] });
    },
  });
  return <PlanOpening frame={frame} opening={opening} thickness={thickness} faceOffset={-thickness / 2} selected={selected} handlers={drag} />;
};

export const PlanWalls: React.FC<PlanWallsProps> = ({ svg, shiftView }) => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const thickness = useSelector(editorSelectors.selectWallThickness);
  const removed = useSelector(editorSelectors.selectRemovedWalls);
  const openings = useSelector(editorSelectors.selectOpenings);
  const viewed = useSelector(editorSelectors.selectViewedWallId);
  const selection = useSelector(selectionSelectors.selectSelection);
  const sides = WALL_SIDES.filter((s) => !removed.includes(s));

  return (
    <g>
      {sides.map((side) => (
        <DragWall key={side} svg={svg} shiftView={shiftView} side={side} selected={selection?.kind === 'wall' && selection.side === side} viewed={viewed === side} />
      ))}
      {sides.flatMap((side) =>
        (openings[side] ?? []).map((o) => (
          <WallOpening
            key={o.id}
            svg={svg}
            side={side}
            frame={wallFrame(side, dims)}
            opening={o}
            thickness={thickness}
            selected={selection?.kind === 'opening' && selection.id === o.id}
          />
        )),
      )}
    </g>
  );
};
