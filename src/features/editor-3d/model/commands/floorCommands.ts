/**
 * Команды этажей: сделать этаж активным (его редактируют 3D, 2D и инспектор),
 * добавить этаж сверху (тот же контур, стены и отделка), удалить, переименовать,
 * сместить, толщина перекрытия. Каждая команда — одно действие: здание, редактор
 * и мебель меняются вместе.
 * @module editor-3d/model/commands/floorCommands
 */

import { clamp, type Vec2 } from '@/shared/lib/math/geometry2d';
import { actions as buildingActions } from '../../building/slice';
import { FLOOR_NAME_LENGTH, floorAbove, floorRise, MAX_FLOORS, SLAB_THICKNESS_LIMITS } from '../../lib/building/floors';
import { liveFloorContent } from '../../lib/scene/build';
import { stairFits } from '../../lib/stairs/stairPlacement';
import { stairLayout } from '../../lib/stairs/stairs';
import { SCENE_LIMITS } from '../../lib/scene/schema';
import type { FloorContent } from '../../types';
import { interaction } from '../interactionStore';
import { createId, type CommandContext } from './context';

/** Создать команды этажей. */
export function createFloorCommands(ctx: CommandContext) {
  const building = () => ctx.getState().building;

  /** Содержимое активного этажа (из слайсов редактора и мебели). */
  function live(): FloorContent {
    const { editor, furniture } = ctx.getState();
    return liveFloorContent(editor, furniture.items);
  }

  /** Содержимое этажа по id (активного — «живое»). */
  function contentOf(id: string): FloorContent | null {
    const b = building();
    return id === b.activeId ? live() : b.stash[id] ?? null;
  }

  return {
    /**
     * Сделать этаж активным.
     * @returns false — этаж уже активен или не найден
     */
    activate(id: string): boolean {
      const b = building();
      const incoming = b.stash[id];
      if (id === b.activeId || !incoming) return false;
      interaction.reset();
      ctx.dispatch(buildingActions.floorActivated({ id, outgoing: live(), incoming }));
      return true;
    },

    /**
     * Добавить этаж над верхним и сделать его активным.
     * @returns id нового этажа или null (этажей уже максимум)
     */
    add(): string | null {
      const b = building();
      if (b.floors.length >= MAX_FLOORS) {
        ctx.notify(`В здании не больше ${MAX_FLOORS} этажей`);
        return null;
      }
      const top = b.floors[b.floors.length - 1];
      const topContent = contentOf(top.id) ?? live();
      const { meta, content } = floorAbove({ meta: top, content: topContent }, b.floors.length, createId('floor'));
      interaction.reset();
      ctx.dispatch(buildingActions.floorAdded({ floor: meta, index: b.floors.length, outgoing: live(), incoming: content }));
      return meta.id;
    },

    /**
     * Удалить этаж (вместе с его стенами, лестницами и мебелью). Если он был активным,
     * активным становится этаж ниже (у первого этажа — этаж выше).
     * @returns false — этаж единственный или не найден
     */
    remove(id: string): boolean {
      const b = building();
      const index = b.floors.findIndex((f) => f.id === id);
      if (index < 0) return false;
      if (b.floors.length <= 1) {
        ctx.notify('В здании должен остаться хотя бы один этаж');
        return false;
      }
      if (id !== b.activeId) {
        ctx.dispatch(buildingActions.floorRemoved({ id }));
        return true;
      }
      const next = b.floors[index - 1] ?? b.floors[index + 1];
      interaction.reset();
      ctx.dispatch(buildingActions.floorRemoved({ id, next: { id: next.id, incoming: b.stash[next.id] } }));
      return true;
    },

    /** Переименовать этаж (пустое название не принимается). */
    rename(id: string, name: string): boolean {
      const trimmed = name.trim().slice(0, FLOOR_NAME_LENGTH);
      const floor = building().floors.find((f) => f.id === id);
      if (!floor || !trimmed || trimmed === floor.name) return false;
      ctx.dispatch(buildingActions.floorRenamed({ id, name: trimmed }));
      return true;
    },

    /** Сместить этаж на плане (центр этажа относительно здания). */
    setOffset(id: string, offset: Vec2): void {
      const limit = SCENE_LIMITS.coordinate;
      const next: [number, number] = [clamp(offset[0], -limit, limit), clamp(offset[1], -limit, limit)];
      const floor = building().floors.find((f) => f.id === id);
      if (floor && (floor.offset[0] !== next[0] || floor.offset[1] !== next[1])) ctx.dispatch(buildingActions.floorOffsetSet({ id, offset: next }));
    },

    /**
     * Толщина перекрытия между этажами. Подъём лестниц растёт вместе с ней, поэтому
     * значение не применяется, если какой-то лестнице на каком-то этаже не хватит места.
     */
    setSlabThickness(thickness: number): boolean {
      if (!Number.isFinite(thickness)) return false;
      const next = clamp(thickness, SLAB_THICKNESS_LIMITS[0], SLAB_THICKNESS_LIMITS[1]);
      if (next === building().slabThickness) return false;
      const blocked = building().floors.find((meta) => {
        const content = contentOf(meta.id);
        const rise = content ? floorRise(content.dimensions, next) : 0;
        return content?.stairs.some((s) => !stairFits(s, stairLayout(s.kind, rise, s.width), content.dimensions, content.partitions));
      });
      if (blocked) {
        ctx.notify(`Лестнице на этаже «${blocked.name}» не хватит места при перекрытии ${Math.round(next * 100)} см`);
        return false;
      }
      ctx.dispatch(buildingActions.slabThicknessSet(next));
      return true;
    },
  };
}
