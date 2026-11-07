/**
 * Команды комнаты (активного этажа): размеры (с перемещением стены), толщина и материал
 * внешних стен, отделка поверхностей, удаление/возврат внешних стен, свет.
 * @module editor-3d/model/commands/roomCommands
 */

import { clamp } from '@/shared/lib/math/geometry2d';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { buildingSelectors } from '../../building/selectors';
import { actions as buildingActions } from '../../building/slice';
import { updateOuterWalls, type OuterWallTarget } from '../../lib/outerWalls';
import { anchorForDraggedWall, resizeRoom, resizeShift, type ResizeAnchor } from '../../lib/roomResize';
import { SCENE_LIMITS } from '../../lib/scene/schema';
import { withCarried } from '../../lib/supportLinks';
import { actions as editorActions } from '../../slice';
import type { FinishTarget, LightConfig, OuterWallSpec, RoomDimensions, SurfaceFinish, WallSide } from '../../types';
import type { CommandContext } from './context';
import { syncLayout } from './layoutSync';

/** Ограничить размеры комнаты допустимыми значениями. */
export function clampDimensions(dims: RoomDimensions): RoomDimensions {
  return {
    width: clamp(dims.width, SCENE_LIMITS.width[0], SCENE_LIMITS.width[1]),
    height: clamp(dims.height, SCENE_LIMITS.height[0], SCENE_LIMITS.height[1]),
    depth: clamp(dims.depth, SCENE_LIMITS.depth[0], SCENE_LIMITS.depth[1]),
  };
}

/**
 * Создать команды комнаты.
 * @param ctx - контекст команд
 * @param settleFurniture - досадка мебели (подвешенные предметы пересаживаются на свои стены и под потолок)
 */
export function createRoomCommands(ctx: CommandContext, settleFurniture: () => void = () => {}) {
  const editor = () => ctx.getState().editor;

  /**
   * Изменить размеры комнаты. Проёмы, перегородки, лестницы и мебель пересчитываются,
   * чтобы остаться внутри и на своих местах относительно неподвижных стен;
   * предметы на опорах (лампа на столе) едут вместе со своей опорой, картины остаются на своих
   * стенах, люстры — под потолком. Этаж смещается в здании так, что неподвижные стены
   * и содержимое остаются на месте и над этажом ниже.
   */
  function resize(next: RoomDimensions, anchor: ResizeAnchor = {}): void {
    const { dimensions, openings, partitions, rooms, stairs } = editor();
    const target = clampDimensions(next);
    if (target.width === dimensions.width && target.height === dimensions.height && target.depth === dimensions.depth) return;
    const state = ctx.getState();
    const { furniture: furnitureState, building } = state;
    const furniture = furnitureState.items;
    const floor = furniture.filter((i) => !i.supportId);
    const cutouts = buildingSelectors.selectCutoutsFromBelow(state);
    const result = resizeRoom({ dimensions, openings, partitions, rooms, stairs, cutouts, furniture: floor }, target, anchor, building.slabThickness);
    ctx.dispatch(editorActions.setDimensions(result.dimensions));
    ctx.dispatch(editorActions.setOpenings(result.openings));
    ctx.dispatch(editorActions.setPartitions(result.partitions));
    ctx.dispatch(editorActions.setRooms(result.rooms ?? rooms));
    ctx.dispatch(editorActions.setStairs(result.stairs ?? stairs));
    ctx.dispatch(furnitureActions.replaceFurniture(withCarried(furniture, result.furniture)));
    const shift = resizeShift(dimensions, target, anchor);
    const meta = building.floors.find((f) => f.id === building.activeId);
    if (meta && (shift[0] !== 0 || shift[1] !== 0)) {
      ctx.dispatch(buildingActions.floorOffsetSet({ id: meta.id, offset: [meta.offset[0] - shift[0], meta.offset[1] - shift[1]] }));
    }
    syncLayout(ctx);
    if (ctx.getState().furniture.items.some((i) => i.mount)) settleFurniture();
  }

  return {
    resize,

    /** Перетащить внешнюю стену: противоположная остаётся на месте. */
    dragWall(side: WallSide, offset: number): void {
      const dims = editor().dimensions;
      const along = side === 'left' || side === 'right' ? 'width' : 'depth';
      resize({ ...dims, [along]: dims[along] + offset }, anchorForDraggedWall(side));
    },

    /**
     * Конструкция внешней стены (или всех: target = 'all'): толщина и/или материал.
     * Стена растёт наружу, поэтому мебель, проёмы и внутренние стены не сдвигаются.
     */
    setOuterWall(target: OuterWallTarget, patch: Partial<OuterWallSpec>): void {
      const current = editor().outerWalls;
      const next = updateOuterWalls(current, target, patch);
      if (next !== current) ctx.dispatch(editorActions.setOuterWalls(next));
    },

    /** Толщина всех внешних стен. */
    setWallThickness(thickness: number): void {
      ctx.dispatch(editorActions.setOuterWalls(updateOuterWalls(editor().outerWalls, 'all', { thickness })));
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
