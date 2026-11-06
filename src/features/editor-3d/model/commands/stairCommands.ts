/**
 * Команды лестниц: поставить (инструментом или из каталога), предпросмотр для призрака,
 * переместить, повернуть на 90°, изменить вариант и ширину, удалить.
 * Ступени и длина марша считаются от высоты подъёма — высоты этажа и перекрытия;
 * лестница не пересекает стены, мебель, другие лестницы и вырез в полу над лестницей снизу.
 * @module editor-3d/model/commands/stairCommands
 */

import { clamp, obbOverlap, type Vec2 } from '@/shared/lib/math/geometry2d';
import { actions as selectionActions } from '@/features/selection/slice';
import { formatMeters } from '@/shared/lib/units';
import { buildingSelectors } from '../../building/selectors';
import { floorRise } from '../../lib/building/floors';
import { translateRect } from '../../lib/building/rects';
import { buildObstacles, furnitureFootprint, isFlatItem, partitionFootprint } from '../../lib/placement';
import { SCENE_LIMITS } from '../../lib/scene/schema';
import { autoStairAngle, cutoutObstacle, findStairSpot, resolveStair, type StairPlacement } from '../../lib/stairs/stairPlacement';
import { DEFAULT_STAIR_WIDTH, normalizeStair, snapQuarter, STAIR_WIDTH_LIMITS, stairCutout, stairLayout } from '../../lib/stairs/stairs';
import { actions as editorActions } from '../../slice';
import type { Stair, StairKind } from '../../types';
import { createId, placementOptions, type CommandContext } from './context';
import { fixtureObstacles } from './fixtures';

/** Создать команды лестниц. */
export function createStairCommands(ctx: CommandContext) {
  const editor = () => ctx.getState().editor;
  const find = (id: string) => editor().stairs.find((s) => s.id === id) ?? null;
  const rise = () => floorRise(editor().dimensions, ctx.getState().building.slabThickness);
  const layoutOf = (stair: Stair) => stairLayout(stair.kind, rise(), stair.width);

  /** Препятствия для лестницы: стены, мебель (кроме ковров), другие лестницы, вырезы в полу. */
  function obstacles(excludeId?: string) {
    const state = ctx.getState();
    return [...buildObstacles(state.editor.partitions, state.furniture.items), ...fixtureObstacles(state, excludeId)];
  }

  /** Лестница в желаемом месте (с привязками), без записи в сцену. */
  function resolve(stair: Stair): StairPlacement {
    return resolveStair(stair, layoutOf(stair), editor().dimensions, obstacles(stair.id), placementOptions());
  }

  /** Применить изменение лестницы, если она помещается. */
  function commit(next: Stair, message: string): boolean {
    const placed = resolve(normalizeStair(next));
    if (!placed.valid) {
      ctx.notify(message);
      return false;
    }
    ctx.dispatch(editorActions.updateStair(placed.stair));
    return true;
  }

  /** Есть ли на этаже выше мебель или стены над вырезом лестницы. */
  function blockedAbove(stair: Stair): boolean {
    const state = ctx.getState();
    const index = buildingSelectors.selectActiveIndex(state);
    const frames = buildingSelectors.selectFloorFrames(state);
    const meta = state.building.floors[index + 1];
    const above = meta && state.building.stash[meta.id];
    if (!above) return false;
    const shift: Vec2 = [frames[index].offset[0] - frames[index + 1].offset[0], frames[index].offset[1] - frames[index + 1].offset[1]];
    const hole = cutoutObstacle(translateRect(stairCutout(stair, layoutOf(stair)), shift), 0, above.dimensions.height).footprint;
    return (
      above.partitions.some((p) => obbOverlap(partitionFootprint(p), hole).overlapping) ||
      above.furniture.some((f) => !isFlatItem(f) && obbOverlap(furnitureFootprint(f), hole).overlapping)
    );
  }

  /** Новая лестница в точке (поворот — заданный или вдоль ближайшей стены). */
  const draft = (kind: StairKind, center: Vec2, angle: number | null): Stair =>
    normalizeStair({ id: '__draft__', kind, position: [center[0], center[1]], rotation: angle ?? autoStairAngle(center, editor().dimensions), width: DEFAULT_STAIR_WIDTH });

  return {
    /** Высота подъёма лестниц активного этажа. */
    rise,

    /** Призрак лестницы под курсором: где встанет и помещается ли. */
    preview(kind: StairKind, center: Vec2, angle: number | null): StairPlacement {
      return resolve(draft(kind, center, angle));
    },

    /**
     * Поставить лестницу как можно ближе к точке и выделить её.
     * @returns id лестницы или null (нет места или лестниц слишком много)
     */
    place(kind: StairKind, center: Vec2, angle: number | null): string | null {
      if (editor().stairs.length >= SCENE_LIMITS.stairs) {
        ctx.notify(`На этаже не больше ${SCENE_LIMITS.stairs} лестниц`);
        return null;
      }
      const stair = { ...draft(kind, center, angle), id: createId('stair') };
      const direct = resolve(stair);
      const placed = direct.valid ? direct.stair : findStairSpot(stair, layoutOf(stair), editor().dimensions, obstacles(), placementOptions());
      if (!placed) {
        ctx.notify(`Лестнице длиной ${formatMeters(layoutOf(stair).length)} не хватает места на этаже`);
        return null;
      }
      ctx.dispatch(editorActions.addStair(placed));
      ctx.dispatch(selectionActions.select({ kind: 'stair', id: placed.id }));
      if (blockedAbove(placed)) ctx.notify('Над лестницей на этаже выше стоят мебель или стены — передвиньте их');
      return placed.id;
    },

    /** Переместить лестницу (центр марша); false — место занято. */
    move(id: string, center: Vec2): boolean {
      const stair = find(id);
      if (!stair) return false;
      const placed = resolve({ ...stair, position: [center[0], center[1]] });
      if (placed.valid) ctx.dispatch(editorActions.updateStair(placed.stair));
      return placed.valid;
    },

    /** Повернуть лестницу на абсолютный угол (приводится к 90°). */
    rotate(id: string, angle: number): boolean {
      const stair = find(id);
      return stair ? commit({ ...stair, rotation: snapQuarter(angle) }, 'Повёрнутая лестница не помещается — сдвиньте её') : false;
    },

    /** Прямой марш или с площадкой. */
    setKind(id: string, kind: StairKind): boolean {
      const stair = find(id);
      return stair && stair.kind !== kind ? commit({ ...stair, kind }, 'Лестница с площадкой длиннее — ей не хватает места') : false;
    },

    /** Ширина марша. */
    setWidth(id: string, width: number): boolean {
      const stair = find(id);
      if (!stair || !Number.isFinite(width)) return false;
      return commit({ ...stair, width: clamp(width, STAIR_WIDTH_LIMITS[0], STAIR_WIDTH_LIMITS[1]) }, 'Такой ширине лестницы не хватает места');
    },

    /** Удалить лестницу. */
    remove(id: string): void {
      if (find(id)) ctx.dispatch(editorActions.removeStair(id));
    },
  };
}
