/**
 * 2D-режим активного этажа: выбор стены (передняя, задняя, левая, правая), план сверху
 * (этаж ниже — полупрозрачной подложкой), развёртка стены и переключатель этажей.
 * Редактирование стен, проёмов, перегородок, лестниц и мебели — те же команды, что в 3D,
 * поэтому изменения сразу видны в 3D и инспекторе.
 * @module widgets/plan-editor-2d/ui/PlanEditor2D
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { isWallSide, WALL_LABELS, WALL_SIDES } from '@/features/editor-3d/lib/walls';
import { interaction } from '@/features/editor-3d/model/interactionStore';
import { FloorSwitcher } from '@/features/editor-3d/ui/FloorSwitcher';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import type { WallSide } from '@/features/editor-3d/types';
import { Button, Segmented } from '@/shared/ui/controls';
import { ElevationView } from './ElevationView';
import { PlanView } from './PlanView';
import styles from './PlanEditor2D.module.scss';

const WALL_OPTIONS = WALL_SIDES.map((side) => ({ value: side, label: WALL_LABELS[side] }));

export const PlanEditor2D: React.FC = () => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const viewed = useSelector(editorSelectors.selectViewedWallId);
  const removed = useSelector(editorSelectors.selectRemovedWalls);
  const tool = useSelector(editorSelectors.selectActiveTool);
  const activeFloor = useSelector(buildingSelectors.selectActiveFloorId);
  const side: WallSide = isWallSide(viewed) ? viewed : 'front';
  const hint =
    tool === 'partition'
      ? 'Кликните начало и конец стены · концы липнут к стенам · правая кнопка или Esc — закончить'
      : tool === 'stair'
        ? 'Кликните по полу, чтобы поставить лестницу · R — поворот на 90° · правая кнопка или Esc — закончить'
        : 'Тяните стены, проёмы, лестницы и мебель мышью · клик по помещению — название и площадь · колесо — масштаб';
  const toggleStair = () => {
    if (tool !== 'stair') interaction.chooseStair('straight');
    dispatch(editorActions.setActiveTool(tool === 'stair' ? 'select' : 'stair'));
  };

  const pickWall = (next: WallSide) => {
    dispatch(editorActions.setViewedWallId(next));
    commands.select({ kind: 'wall', side: next });
  };

  return (
    <section className={styles.wrap} aria-label="2D-редактор">
      <div className={styles.bar}>
        <Segmented ariaLabel="Стена" options={WALL_OPTIONS} value={side} onChange={pickWall} />
        <span className={styles.hint}>{hint}</span>
        <Button size="sm" icon="window" disabled={removed.includes(side)} onClick={() => commands.openings.add(side, 'window')}>
          Окно
        </Button>
        <Button size="sm" icon="door" disabled={removed.includes(side)} onClick={() => commands.openings.add(side, 'door')}>
          Дверь
        </Button>
        <Button
          size="sm"
          icon="partition"
          variant={tool === 'partition' ? 'primary' : 'secondary'}
          onClick={() => dispatch(editorActions.setActiveTool(tool === 'partition' ? 'select' : 'partition'))}
        >
          {tool === 'partition' ? 'Готово' : 'Стена'}
        </Button>
        <Button size="sm" icon="stairs" variant={tool === 'stair' ? 'primary' : 'secondary'} onClick={toggleStair}>
          {tool === 'stair' ? 'Готово' : 'Лестница'}
        </Button>
      </div>
      <div className={styles.views}>
        <div className={styles.pane}>
          <span className={styles.paneTitle}>План</span>
          <FloorSwitcher className={styles.floors} />
          <PlanView key={activeFloor} />
        </div>
        <div className={styles.pane}>
          <span className={styles.paneTitle}>{WALL_LABELS[side]} стена{removed.includes(side) ? ' (удалена)' : ''}</span>
          <ElevationView key={side} side={side} />
        </div>
      </div>
    </section>
  );
};
