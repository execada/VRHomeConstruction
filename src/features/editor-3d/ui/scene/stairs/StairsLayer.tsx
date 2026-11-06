/**
 * Лестницы активного этажа: выделение кликом и перетаскивание по полу (лестница
 * не заходит в стены, мебель и вырезы — см. команды лестниц). От первого лица лестница
 * не перетаскивается (зажатая кнопка — осмотр), а выделяется кликом.
 * @module editor-3d/ui/scene/stairs/StairsLayer
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { add2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { buildingSelectors } from '../../../building/selectors';
import { stairLayout } from '../../../lib/stairs/stairs';
import { isPointerBusy } from '../../../model/interactionStore';
import { useSceneCommands } from '../../../model/useSceneCommands';
import { selectors as editorSelectors } from '../../../selectors';
import type { Stair } from '../../../types';
import { floorRay, isClick, rayToFloor, type SceneMouseEvent } from '../pointer';
import { useDragGesture } from '../useDragGesture';
import { useWalkingCheck } from '../useWalkingCheck';
import { StairMesh } from './StairMesh';

const ActiveStair: React.FC<{ stair: Stair; rise: number; selected: boolean }> = memo(({ stair, rise, selected }) => {
  const commands = useSceneCommands();
  const isWalking = useWalkingCheck();
  const layout = useMemo(() => stairLayout(stair.kind, rise, stair.width), [stair.kind, rise, stair.width]);
  const drag = useDragGesture<{ offset: Vec2 }>({
    id: stair.id,
    onStart: (e) => {
      if (isWalking()) return null;
      commands.select({ kind: 'stair', id: stair.id });
      const hit = rayToFloor(floorRay(e.ray));
      return hit ? { offset: sub2(stair.position, hit) } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToFloor(floorRay(e.ray));
      if (hit) commands.stairs.move(stair.id, add2(hit, ctx.offset));
    },
  });
  const handlers = useMemo(
    () => ({
      ...drag,
      onClick: (e: SceneMouseEvent) => {
        // Клик по лестнице не «проваливается» к полу за ней; от первого лица — выделяет её.
        if (isPointerBusy()) return;
        e.stopPropagation();
        if (isWalking() && isClick(e)) commands.select({ kind: 'stair', id: stair.id });
      },
    }),
    [drag, isWalking, commands, stair.id],
  );
  return <StairMesh stair={stair} layout={layout} selected={selected} handlers={handlers} />;
});

export const StairsLayer: React.FC = () => {
  const stairs = useSelector(editorSelectors.selectStairs);
  const rise = useSelector(buildingSelectors.selectActiveRise);
  const selection = useSelector(selectionSelectors.selectSelection);
  return (
    <>
      {stairs.map((s) => (
        <ActiveStair key={s.id} stair={s} rise={rise} selected={selection?.kind === 'stair' && selection.id === s.id} />
      ))}
    </>
  );
};
