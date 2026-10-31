/**
 * Развёртка выбранной стены (вид изнутри комнаты): проёмы перетаскиваются вдоль стены
 * и по высоте (двери — только вдоль), ручки меняют ширину и высоту; мебель у стены
 * показана силуэтами и сдвигается вдоль стены.
 * Координаты SVG: x = u вдоль стены, y = −высота (вверх — к отрицательным y).
 * @module widgets/plan-editor-2d/ui/ElevationView
 */

import React, { useMemo, useRef } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { openingSill } from '@/features/editor-3d/lib/openings';
import { wallFrame, type WallFrame } from '@/features/editor-3d/lib/walls';
import type { Opening, WallSide } from '@/features/editor-3d/types';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { itemsNearWall, slideAlongWall, type WallProjection } from '../lib/plan';
import { useSvgDrag, useSvgViewport } from '../model/useSvgInteraction';
import styles from './PlanEditor2D.module.scss';

type SvgRef = React.RefObject<SVGSVGElement | null>;

const HANDLE = 0.12;
const NEAR_WALL = 0.8;

const ElevationOpening: React.FC<{ svg: SvgRef; side: WallSide; opening: Opening; selected: boolean }> = ({ svg, side, opening, selected }) => {
  const commands = useSceneCommands();
  const [u, y] = opening.position;
  const sill = openingSill(opening);
  const move = useSvgDrag<{ du: number; dy: number }>({
    svg,
    onStart: (p) => {
      commands.select({ kind: 'opening', hostId: side, id: opening.id });
      return { du: u - p[0], dy: y + p[1] };
    },
    onMove: (p, ctx) => commands.openings.move(side, opening.id, { u: p[0] + ctx.du, y: -p[1] + ctx.dy }),
  });
  const resizeWidth = useSvgDrag<object>({
    svg,
    onStart: () => ({}),
    onMove: (p) => commands.openings.resize(side, opening.id, { width: Math.max(0.3, (p[0] - (u - opening.width / 2)) ) }),
  });
  const resizeHeight = useSvgDrag<object>({
    svg,
    onStart: () => ({}),
    onMove: (p) => commands.openings.resize(side, opening.id, { height: Math.max(0.3, -p[1] - sill) }),
  });
  const x0 = u - opening.width / 2;
  const top = -(sill + opening.height);
  return (
    <g>
      <rect
        x={x0}
        y={top}
        width={opening.width}
        height={opening.height}
        className={cn(styles.elevationOpening, opening.type === 'window' ? styles.glass : styles.doorFill, selected && styles.openingSelected)}
        vectorEffect="non-scaling-stroke"
        {...move}
      >
        <title>{opening.type === 'window' ? 'Окно: перетащите по стене и по высоте' : 'Дверь: перетащите вдоль стены'}</title>
      </rect>
      {selected && (
        <>
          <rect x={x0 + opening.width - HANDLE / 2} y={top + opening.height / 2 - HANDLE / 2} width={HANDLE} height={HANDLE} className={styles.handle} vectorEffect="non-scaling-stroke" {...resizeWidth} />
          <rect x={u - HANDLE / 2} y={top - HANDLE / 2} width={HANDLE} height={HANDLE} className={styles.handle} vectorEffect="non-scaling-stroke" {...resizeHeight} />
        </>
      )}
      <text x={u} y={top - 0.12} fontSize={0.13} className={styles.dimension}>
        {Math.round(opening.width * 100)}×{Math.round(opening.height * 100)}
        {opening.type === 'window' ? ` · ${Math.round(sill * 100)} от пола` : ''}
      </text>
    </g>
  );
};

const Silhouette: React.FC<{ svg: SvgRef; frame: WallFrame; projection: WallProjection; selected: boolean }> = ({ svg, frame, projection, selected }) => {
  const commands = useSceneCommands();
  const { item, u0, u1, bottom, top } = projection;
  const drag = useSvgDrag<{ start: number }>({
    svg,
    onStart: (p) => {
      commands.select({ kind: 'furniture', id: item.id });
      return item.locked ? null : { start: p[0] };
    },
    onMove: (p, ctx) => {
      if (commands.furniture.move(item.id, slideAlongWall(item, frame, p[0] - ctx.start))) ctx.start = p[0];
    },
  });
  return (
    <g>
      <rect x={u0} y={-top} width={u1 - u0} height={top - bottom} className={cn(styles.silhouette, selected && styles.itemSelected)} vectorEffect="non-scaling-stroke" {...drag}>
        <title>{item.name}: перетащите вдоль стены</title>
      </rect>
      <text x={(u0 + u1) / 2} y={-(top + bottom) / 2} fontSize={0.11} className={styles.label}>
        {item.name.length > 16 ? `${item.name.slice(0, 15)}…` : item.name}
      </text>
    </g>
  );
};

export const ElevationView: React.FC<{ side: WallSide }> = ({ side }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const finish = useSelector(editorSelectors.selectFinishes).walls[side];
  const openings = useSelector(editorSelectors.selectOpenings)[side] ?? [];
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const selection = useSelector(selectionSelectors.selectSelection);
  const frame = useMemo(() => wallFrame(side, dims), [side, dims]);
  const near = useMemo(() => itemsNearWall(items, frame, NEAR_WALL), [items, frame]);
  const svg = useRef<SVGSVGElement>(null);
  const fit = useMemo(
    () => ({ x: -frame.length / 2 - 0.6, y: -dims.height - 0.7, width: frame.length + 1.2, height: dims.height + 1.2 }),
    [frame.length, dims.height],
  );
  const viewport = useSvgViewport(svg, fit);

  return (
    <svg ref={svg} className={styles.svg} viewBox={viewport.viewBox} preserveAspectRatio="xMidYMid meet" role="application" aria-label="Развёртка стены" {...viewport.panHandlers} onDoubleClick={() => viewport.reset()}>
      <rect
        x={-frame.length / 2}
        y={-dims.height}
        width={frame.length}
        height={dims.height}
        fill={finish.color}
        className={styles.elevationWall}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          e.stopPropagation();
          commands.select({ kind: 'wall', side });
        }}
      />
      {near.map((p) => (
        <Silhouette key={p.item.id} svg={svg} frame={frame} projection={p} selected={selection?.kind === 'furniture' && selection.id === p.item.id} />
      ))}
      {openings.map((o) => (
        <ElevationOpening key={o.id} svg={svg} side={side} opening={o} selected={selection?.kind === 'opening' && selection.id === o.id} />
      ))}
      <line x1={-frame.length / 2 - 0.3} y1={0} x2={frame.length / 2 + 0.3} y2={0} className={styles.floorLine} vectorEffect="non-scaling-stroke" />
      <text x={0} y={0.35} fontSize={0.16} className={styles.dimension}>
        {frame.length.toFixed(2)} × {dims.height.toFixed(2)} м
      </text>
    </svg>
  );
};
