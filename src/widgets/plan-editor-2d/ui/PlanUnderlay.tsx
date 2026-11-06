/**
 * Подложка 2D-плана: этаж под активным — полупрозрачные контур стен, внутренние стены,
 * лестницы и мебель (в координатах активного этажа, с учётом смещения этажей).
 * Указатель подложка не перехватывает: редактируется только активный этаж.
 * @module widgets/plan-editor-2d/ui/PlanUnderlay
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { floorRise } from '@/features/editor-3d/lib/building/floors';
import { translateRect } from '@/features/editor-3d/lib/building/rects';
import { furnitureFootprint, isFlatItem, partitionFootprint } from '@/features/editor-3d/lib/placement';
import { stairFootprint, stairLayout } from '@/features/editor-3d/lib/stairs/stairs';
import { interiorRect, outerBounds } from '@/features/editor-3d/lib/walls';
import type { Obb, Vec2 } from '@/shared/lib/math/geometry2d';
import { footprintPoints, rectPoints } from '../lib/plan';
import styles from './PlanEditor2D.module.scss';

const shifted = (o: Obb, d: Vec2): Obb => ({ ...o, center: [o.center[0] + d[0], o.center[1] + d[1]] });

export const PlanUnderlay: React.FC = memo(() => {
  const below = useSelector(buildingSelectors.selectFloorBelow);
  const frame = useSelector(buildingSelectors.selectActiveFrame);
  const slab = useSelector(buildingSelectors.selectSlabThickness);
  const shapes = useMemo(() => {
    if (!below) return null;
    const d: Vec2 = [below.frame.offset[0] - frame.offset[0], below.frame.offset[1] - frame.offset[1]];
    const { content } = below;
    const rise = floorRise(below.frame, slab);
    return {
      outer: rectPoints(translateRect(outerBounds(content.dimensions, content.outerWalls), d)),
      inner: rectPoints(translateRect(interiorRect(content.dimensions), d)),
      walls: content.partitions.map((p) => ({ key: p.id, points: footprintPoints(shifted(partitionFootprint(p), d)) })),
      stairs: content.stairs.map((s) => ({ key: s.id, points: footprintPoints(shifted(stairFootprint(s, stairLayout(s.kind, rise, s.width)), d)) })),
      furniture: content.furniture.filter((f) => !isFlatItem(f)).map((f) => ({ key: f.id, points: footprintPoints(shifted(furnitureFootprint(f), d)) })),
    };
  }, [below, frame, slab]);
  if (!below || !shapes) return null;
  return (
    <g className={styles.underlay} pointerEvents="none" aria-label={`Подложка: ${below.meta.name}`}>
      <title>{`Под этим этажом: ${below.meta.name}`}</title>
      <polygon points={shapes.outer} className={styles.underlayWall} vectorEffect="non-scaling-stroke" />
      <polygon points={shapes.inner} className={styles.underlayFloor} vectorEffect="non-scaling-stroke" />
      {shapes.walls.map((w) => (
        <polygon key={w.key} points={w.points} className={styles.underlayWall} vectorEffect="non-scaling-stroke" />
      ))}
      {shapes.stairs.map((s) => (
        <polygon key={s.key} points={s.points} className={styles.underlayStair} vectorEffect="non-scaling-stroke" />
      ))}
      {shapes.furniture.map((f) => (
        <polygon key={f.key} points={f.points} className={styles.underlayItem} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});
