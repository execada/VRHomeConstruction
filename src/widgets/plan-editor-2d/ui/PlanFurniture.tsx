/**
 * Мебель на плане: футпринты с подписями, перетаскивание и ручка поворота (Shift — без шага 15°).
 * Ограничения те же, что в 3D: стены, перегородки, другая мебель, магнит к стенам, края
 * поверхностей. Предметы на опорах (лампа на столе) рисуются поверх опоры пунктиром;
 * перетаскивание на стол ставит предмет на него, за край — на пол.
 * @module widgets/plan-editor-2d/ui/PlanFurniture
 */

import React, { useMemo } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { attachOf } from '@/features/editor-3d/lib/attachRole';
import { furnitureFootprint, itemSizes } from '@/features/editor-3d/lib/placement';
import { ROTATE_STEP } from '@/features/editor-3d/model/interactionStore';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import type { FurnitureItem } from '@/features/furniture/types';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { add2, rotateLocal, snapAngle, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { footprintPoints, planDrawOrder } from '../lib/plan';
import { useSvgDrag } from '../model/useSvgInteraction';
import styles from './PlanEditor2D.module.scss';

type SvgRef = React.RefObject<SVGSVGElement | null>;

const RotateHandle: React.FC<{ svg: SvgRef; item: FurnitureItem }> = ({ svg, item }) => {
  const commands = useSceneCommands();
  const center: Vec2 = [item.position[0], item.position[2]];
  const handle = add2(center, rotateLocal([0, itemSizes(item).halfDepth + 0.25], item.rotation[1]));
  const drag = useSvgDrag<object>({
    svg,
    onStart: () => (item.locked ? null : {}),
    onMove: (point, _ctx, e) => {
      const d = sub2(point, center);
      const angle = Math.atan2(d[0], d[1]);
      commands.furniture.rotate(item.id, e.shiftKey ? angle : snapAngle(angle, ROTATE_STEP));
    },
  });
  return (
    <g>
      <line x1={center[0]} y1={center[1]} x2={handle[0]} y2={handle[1]} className={styles.windowLine} vectorEffect="non-scaling-stroke" />
      <circle cx={handle[0]} cy={handle[1]} r={0.08} className={styles.handle} vectorEffect="non-scaling-stroke" {...drag}>
        <title>Повернуть (Shift — свободно)</title>
      </circle>
    </g>
  );
};

const PlanItem: React.FC<{ svg: SvgRef; item: FurnitureItem; selected: boolean; supportName?: string }> = ({ svg, item, selected, supportName }) => {
  const commands = useSceneCommands();
  const footprint = furnitureFootprint(item);
  const drag = useSvgDrag<{ offset: Vec2 }>({
    svg,
    onStart: (point) => {
      commands.select({ kind: 'furniture', id: item.id });
      return item.locked ? null : { offset: sub2(footprint.center, point) };
    },
    onMove: (point, ctx) => commands.furniture.move(item.id, add2(point, ctx.offset)),
  });
  const fontSize = Math.max(0.07, Math.min(0.16, footprint.half[0] / 4));
  return (
    <g>
      <polygon
        points={footprintPoints(footprint)}
        className={cn(styles.item, item.supportId && styles.itemOnSurface, selected && styles.itemSelected, item.locked && styles.itemLocked)}
        vectorEffect="non-scaling-stroke"
        {...drag}
      >
        <title>{supportName ? `${item.name} — на поверхности «${supportName}»` : item.name}</title>
      </polygon>
      <text x={footprint.center[0]} y={footprint.center[1]} fontSize={fontSize} className={styles.label}>
        {item.name.length > 18 ? `${item.name.slice(0, 17)}…` : item.name}
      </text>
      {selected && attachOf(item) !== 'wall' && <RotateHandle svg={svg} item={item} />}
    </g>
  );
};

export const PlanFurniture: React.FC<{ svg: SvgRef }> = ({ svg }) => {
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const selection = useSelector(selectionSelectors.selectSelection);
  // Ковры и низкие предметы — снизу, предметы на опорах — поверх своих опор.
  const ordered = useMemo(() => planDrawOrder(items), [items]);
  const names = useMemo(() => new Map(items.map((i) => [i.id, i.name] as const)), [items]);
  return (
    <g>
      {ordered.map((item) => (
        <PlanItem
          key={item.id}
          svg={svg}
          item={item}
          selected={selection?.kind === 'furniture' && selection.id === item.id}
          supportName={item.supportId ? names.get(item.supportId) : undefined}
        />
      ))}
    </g>
  );
};
