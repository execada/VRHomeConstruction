/**
 * Инструмент «Лестница»: полупрозрачный призрак лестницы следует за курсором по полу
 * (сквозь стены и мебель — точка берётся на плоскости пола), прижимается к стенам,
 * краснеет, если не помещается. Клик ставит лестницу (обрабатывает вьюпорт, до объектов
 * сцены — см. SceneViewport), Shift+клик — ещё одну, R — поворот на 90°,
 * правая кнопка или Esc — закончить.
 * @module editor-3d/ui/scene/stairs/StairTool
 */

import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useThree } from '@react-three/fiber';
import { useExternalStore } from '@/shared/lib/externalStore';
import { buildingSelectors } from '../../../building/selectors';
import { stairLayout } from '../../../lib/stairs/stairs';
import { interaction, interactionStore } from '../../../model/interactionStore';
import { sceneBridge } from '../../../model/sceneBridge';
import { useSceneCommands } from '../../../model/useSceneCommands';
import { actions as editorActions } from '../../../slice';
import { StairMesh } from './StairMesh';

export const StairTool: React.FC = () => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const element = useThree((s) => s.gl.domElement);
  const rise = useSelector(buildingSelectors.selectActiveRise);
  const ghost = useExternalStore(interactionStore, (s) => s.stairGhost);
  const layout = useMemo(() => (ghost ? stairLayout(ghost.stair.kind, rise, ghost.stair.width) : null), [ghost, rise]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const point = sceneBridge.screenToFloor(e.clientX, e.clientY);
      const { stairKind, stairAngle } = interactionStore.getState();
      if (point) interaction.setStairGhost(commands.stairs.preview(stairKind, point, stairAngle));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) dispatch(editorActions.setActiveTool('select'));
    };
    const onMenu = (e: Event) => e.preventDefault();
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('contextmenu', onMenu);
    interaction.setPlacingStair(true);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('contextmenu', onMenu);
      interaction.setPlacingStair(false);
    };
  }, [element, commands, dispatch]);

  return ghost && layout ? <StairMesh stair={ghost.stair} layout={layout} ghost={ghost.valid ? 'valid' : 'invalid'} /> : null;
};
