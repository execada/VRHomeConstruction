/**
 * Команды комнаты: размеры (с перемещением стены), толщина стен, отделка поверхностей,
 * удаление/возврат внешних стен, свет.
 * @module editor-3d/model/commands/roomCommands
 */

import { clamp } from '@/shared/lib/math/geometry2d';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { WALL_THICKNESS_LIMITS } from '../../constants';
import { anchorForDraggedWall, resizeRoom, type ResizeAnchor } from '../../lib/roomResize';
import { SCENE_LIMITS } from '../../lib/scene/schema';
import { actions as editorActions } from '../../slice';
import type { FinishTarget, LightConfig, RoomDimensions, SurfaceFinish, WallSide } from '../../types';
import type { CommandContext } from './context';

/** Ограничить размеры комнаты допустимыми значениями. */
export function clampDimensions(dims: RoomDimensions): RoomDimensions {
  return {
    width: clamp(dims.width, SCENE_LIMITS.width[0], SCENE_LIMITS.width[1]),
    height: clamp(dims.height, SCENE_LIMITS.height[0], SCENE_LIMITS.height[1]),
    depth: clamp(dims.depth, SCENE_LIMITS.depth[0], SCENE_LIMITS.depth[1]),
  };
}

/** Создать команды комнаты. */
export function createRoomCommands(ctx: CommandContext) {
  const editor = () => ctx.getState().editor;

  /**
   * Изменить размеры комнаты. Проёмы, перегородки и мебель пересчитываются,
   * чтобы остаться внутри и на своих местах относительно неподвижных стен.
   */
  function resize(next: RoomDimensions, anchor: ResizeAnchor = {}): void {
    const { dimensions, openings, partitions } = editor();
    const target = clampDimensions(next);
    if (target.width === dimensions.width && target.height === dimensions.height && target.depth === dimensions.depth) return;
    const result = resizeRoom({ dimensions, openings, partitions, furniture: ctx.getState().furniture.items }, target, anchor);
    ctx.dispatch(editorActions.setDimensions(result.dimensions));
    ctx.dispatch(editorActions.setOpenings(result.openings));
    ctx.dispatch(editorActions.setPartitions(result.partitions));
    ctx.dispatch(furnitureActions.replaceFurniture(result.furniture));
  }

  return {
    resize,

    /** Перетащить внешнюю стену: противоположная остаётся на месте. */
    dragWall(side: WallSide, offset: number): void {
      const dims = editor().dimensions;
      const along = side === 'left' || side === 'right' ? 'width' : 'depth';
      resize({ ...dims, [along]: dims[along] + offset }, anchorForDraggedWall(side));
    },

    /** Толщина внешних стен. */
    setWallThickness(thickness: number): void {
      ctx.dispatch(editorActions.setWallThickness(clamp(thickness, WALL_THICKNESS_LIMITS[0], WALL_THICKNESS_LIMITS[1])));
    },

    /** Отделка поверхности. */
    setFinish(target: FinishTarget, finish: SurfaceFinish): void {
      ctx.dispatch(editorActions.setFinish({ target, finish }));
    },

    /** Удалить или вернуть внешнюю стену. */
    toggleWall(side: WallSide): void {
      const removed = editor().removedWalls;
      const next = removed.includes(side) ? removed.filter((s) => s !== side) : [...removed, side];
      ctx.dispatch(editorActions.setRemovedWalls(next));
    },

    /** Изменить свет комнаты (частично). */
    setLight(patch: Partial<LightConfig>): void {
      ctx.dispatch(editorActions.setLight({ ...editor().light, ...patch }));
    },
  };
}
