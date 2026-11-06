/**
 * Команды сцены — единая точка изменения комнаты для 3D, 2D, VR и инспектора.
 * Все режимы вызывают одни и те же команды, поэтому они всегда синхронизированы
 * и одинаково соблюдают ограничения (нет проникновений, проёмы не накладываются).
 * @module editor-3d/model/commands
 */

import { actions as selectionActions } from '@/features/selection/slice';
import type { SceneSelection } from '@/features/selection/types';
import { createFloorCommands } from './floorCommands';
import { createFurnitureCommands } from './furnitureCommands';
import { createOpeningCommands } from './openingCommands';
import { createPartitionCommands } from './partitionCommands';
import { createRoomCommands } from './roomCommands';
import { createRoomLabelCommands } from './roomLabelCommands';
import { createStairCommands } from './stairCommands';
import type { CommandContext } from './context';

/** Создать все команды сцены. */
export function createSceneCommands(ctx: CommandContext) {
  const furniture = createFurnitureCommands(ctx);
  const openings = createOpeningCommands(ctx);
  const partitions = createPartitionCommands(ctx, furniture.settle);
  const room = createRoomCommands(ctx);
  const rooms = createRoomLabelCommands(ctx);
  const stairs = createStairCommands(ctx);
  const floors = createFloorCommands(ctx);
  const current = () => ctx.getState().selection.current;
  const stairOf = (id: string) => ctx.getState().editor.stairs.find((s) => s.id === id);

  return {
    furniture,
    openings,
    partitions,
    room,
    /** Помещения, вычисленные по стенам (названия и виды) */
    rooms,
    /** Лестницы активного этажа */
    stairs,
    /** Этажи здания */
    floors,

    /** Выделить объект (null — снять выделение). */
    select(selection: SceneSelection | null): void {
      ctx.dispatch(selectionActions.select(selection));
    },

    /** Удалить выделенный объект (мебель, перегородку или проём). */
    deleteSelection(): void {
      const sel = current();
      if (sel?.kind === 'furniture') furniture.remove(sel.id);
      else if (sel?.kind === 'partition') partitions.remove(sel.id);
      else if (sel?.kind === 'stair') stairs.remove(sel.id);
      else if (sel?.kind === 'opening') openings.remove(sel.hostId, sel.id);
      else if (sel?.kind === 'wall') room.toggleWall(sel.side);
      ctx.dispatch(selectionActions.clearSelection());
    },

    /** Дублировать выделенный предмет мебели. */
    duplicateSelection(): void {
      const sel = current();
      if (sel?.kind === 'furniture') furniture.duplicate(sel.id);
    },

    /** Повернуть выделенный объект на угол (лестницу — на 90° в ту же сторону). */
    rotateSelection(delta: number): void {
      const sel = current();
      if (sel?.kind === 'furniture') furniture.rotateBy(sel.id, delta);
      const stair = sel?.kind === 'stair' ? stairOf(sel.id) : undefined;
      if (stair) stairs.rotate(stair.id, stair.rotation + Math.sign(delta) * (Math.PI / 2));
      if (sel?.kind === 'partition') {
        const p = ctx.getState().editor.partitions.find((x) => x.id === sel.id);
        if (p) {
          partitions.rotate(sel.id, p.rotation[1] + delta);
          partitions.endGesture();
        }
      }
    },

    /** Сдвинуть выделенный объект на полу. */
    nudgeSelection(dx: number, dz: number): void {
      const sel = current();
      if (sel?.kind === 'furniture') furniture.nudge(sel.id, dx, dz);
      const stair = sel?.kind === 'stair' ? stairOf(sel.id) : undefined;
      if (stair) stairs.move(stair.id, [stair.position[0] + dx, stair.position[1] + dz]);
      if (sel?.kind === 'partition') {
        const p = ctx.getState().editor.partitions.find((x) => x.id === sel.id);
        if (p) {
          partitions.move(sel.id, [p.position[0] + dx, p.position[2] + dz]);
          partitions.endGesture();
        }
      }
    },
  };
}

export type SceneCommands = ReturnType<typeof createSceneCommands>;
export type { CommandContext, SceneRootState } from './context';
