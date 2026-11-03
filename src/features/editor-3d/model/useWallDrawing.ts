/**
 * Рисование внутренних стен (3D и 2D): первый клик — начало, второй — конец стены.
 * Концы привязываются к стенам, граням внешних стен, углам 45° и сетке. Если конец попал
 * на стену, рисование завершается; в свободном месте — продолжается цепочкой от конца.
 * Esc или правая кнопка — закончить цепочку.
 * @module editor-3d/model/useWallDrawing
 */

import { useMemo } from 'react';
import { useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { snapWallPoint, type SnapResult } from '../lib/wallSnap';
import { GRID_STEP, interaction, interactionStore } from './interactionStore';
import { useSceneCommands } from './useSceneCommands';

/** Привязки, после которых цепочка стен заканчивается (стена во что-то упёрлась). */
const CLOSING_SNAPS: ReadonlySet<SnapResult['kind']> = new Set(['endpoint', 'wall', 'outer']);

/** Операции рисования стен. */
export interface WallDrawing {
  /** Курсор над полом */
  hover: (point: Vec2) => void;
  /** Клик по полу: начало или конец стены */
  click: (point: Vec2) => void;
  /** Закончить цепочку (true — было что заканчивать) */
  finish: () => boolean;
}

export function useWallDrawing(): WallDrawing {
  const store = useStore<RootState>();
  const commands = useSceneCommands();

  return useMemo(() => {
    const draft = () => interactionStore.getState().wallDraft;
    const snap = (point: Vec2): SnapResult => {
      const { editor } = store.getState();
      const grid = interactionStore.getState().gridEnabled ? GRID_STEP : null;
      return snapWallPoint(point, editor.dimensions, editor.partitions, { from: draft()?.start ?? null, grid });
    };
    return {
      hover(point) {
        const r = snap(point);
        interaction.setWallDraft({ start: draft()?.start ?? null, cursor: r.point, snap: r.kind });
      },
      click(point) {
        const r = snap(point);
        const start = draft()?.start ?? null;
        if (!start) {
          interaction.setWallDraft({ start: r.point, cursor: r.point, snap: r.kind });
          return;
        }
        const id = commands.partitions.draw(start, r.point);
        const next = id && !CLOSING_SNAPS.has(r.kind) ? r.point : id ? null : start;
        interaction.setWallDraft({ start: next, cursor: r.point, snap: r.kind });
      },
      finish() {
        const current = draft();
        if (!current?.start) return false;
        interaction.setWallDraft({ ...current, start: null });
        return true;
      },
    };
  }, [store, commands]);
}
