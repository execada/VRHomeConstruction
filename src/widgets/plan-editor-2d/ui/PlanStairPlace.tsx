/**
 * Установка лестницы на плане (инструмент «Лестница»): призрак марша следует за курсором,
 * прижимается к стенам и краснеет, если не помещается; клик ставит лестницу, Shift+клик —
 * ещё одну, R — поворот на 90°, правая кнопка или Esc — закончить.
 * @module widgets/plan-editor-2d/ui/PlanStairPlace
 */

import React, { useEffect, useRef } from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { interaction, interactionStore } from '@/features/editor-3d/model/interactionStore';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { useExternalStore } from '@/shared/lib/externalStore';
import { clientToSvg } from '../model/useSvgInteraction';
import { StairShape } from './PlanStairs';
import styles from './PlanEditor2D.module.scss';

const CLICK_PX = 5;

export const PlanStairPlace: React.FC<{ svg: React.RefObject<SVGSVGElement | null> }> = ({ svg }) => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const rise = useSelector(buildingSelectors.selectActiveRise);
  const ghost = useExternalStore(interactionStore, (s) => s.stairGhost);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    interaction.setPlacingStair(true);
    return () => interaction.setPlacingStair(false);
  }, []);

  const preview = (e: React.PointerEvent) => {
    const point = clientToSvg(svg.current, e.clientX, e.clientY);
    const { stairKind, stairAngle } = interactionStore.getState();
    if (point) interaction.setStairGhost(commands.stairs.preview(stairKind, point, stairAngle));
  };
  const finish = () => dispatch(editorActions.setActiveTool('select'));

  return (
    <>
      <rect
        x={-1000}
        y={-1000}
        width={2000}
        height={2000}
        className={styles.drawLayer}
        onPointerMove={preview}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 2) finish();
          if (e.button === 0) down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = down.current;
          down.current = null;
          const target = interactionStore.getState().stairGhost;
          if (e.button !== 0 || !start || !target || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_PX) return;
          const id = commands.stairs.place(target.stair.kind, target.stair.position, target.stair.rotation);
          if (id && !e.shiftKey) finish();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {ghost && (
        <g pointerEvents="none">
          <StairShape stair={ghost.stair} rise={rise} className={cn(styles.stairGhost, !ghost.valid && styles.stairGhostInvalid)} />
        </g>
      )}
    </>
  );
};
