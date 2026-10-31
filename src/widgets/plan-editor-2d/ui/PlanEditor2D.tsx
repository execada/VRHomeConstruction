/**
 * 2D-режим: выбор стены (передняя, задняя, левая, правая), план сверху и развёртка стены.
 * Редактирование стен, проёмов, перегородок и мебели — те же команды, что в 3D,
 * поэтому изменения сразу видны в 3D и инспекторе.
 * @module widgets/plan-editor-2d/ui/PlanEditor2D
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isWallSide, WALL_LABELS, WALL_SIDES } from '@/features/editor-3d/lib/walls';
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
  const side: WallSide = isWallSide(viewed) ? viewed : 'front';

  const pickWall = (next: WallSide) => {
    dispatch(editorActions.setViewedWallId(next));
    commands.select({ kind: 'wall', side: next });
  };

  return (
    <section className={styles.wrap} aria-label="2D-редактор">
      <div className={styles.bar}>
        <Segmented ariaLabel="Стена" options={WALL_OPTIONS} value={side} onChange={pickWall} />
        <span className={styles.hint}>
          Тяните стены, проёмы, перегородки и мебель мышью · колесо — масштаб · двойной клик — показать всё
        </span>
        <Button size="sm" icon="window" disabled={removed.includes(side)} onClick={() => commands.openings.add(side, 'window')}>
          Окно
        </Button>
        <Button size="sm" icon="door" disabled={removed.includes(side)} onClick={() => commands.openings.add(side, 'door')}>
          Дверь
        </Button>
        <Button size="sm" icon="partition" onClick={() => commands.partitions.add()}>
          Перегородка
        </Button>
      </div>
      <div className={styles.views}>
        <div className={styles.pane}>
          <span className={styles.paneTitle}>План</span>
          <PlanView />
        </div>
        <div className={styles.pane}>
          <span className={styles.paneTitle}>{WALL_LABELS[side]} стена{removed.includes(side) ? ' (удалена)' : ''}</span>
          <ElevationView key={side} side={side} />
        </div>
      </div>
    </section>
  );
};
