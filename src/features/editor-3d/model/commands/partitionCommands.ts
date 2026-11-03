/**
 * Команды внутренних стен (перегородок): нарисовать по двум точкам, добавить, переместить,
 * повернуть, изменить длину/высоту/толщину, концы на плане, материал, отделку,
 * скругление углов, удалить.
 * После изменения стен проёмы выходят из зон стыков, подписи помещений переносятся,
 * а мебель «досаживается», чтобы не оказаться внутри стены.
 * @module editor-3d/model/commands/partitionCommands
 */

import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { actions as selectionActions } from '@/features/selection/slice';
import { actions as editorActions } from '../../slice';
import {
  clampPartition,
  createPartition,
  movePartition,
  PARTITION_LIMITS,
  partitionFromEndpoints,
  resizePartition,
  rotatePartition,
} from '../../lib/partitions';
import { SCENE_LIMITS } from '../../lib/scene/schema';
import { isWallMaterialId, wallMaterial } from '../../lib/wallMaterials';
import type { Partition, SurfaceFinish, WallMaterialId } from '../../types';
import { createId, type CommandContext } from './context';
import { syncLayout } from './layoutSync';

/** Параметры новой стены. */
export interface WallDraftOptions {
  material?: WallMaterialId;
  /** Толщина (по умолчанию — типовая для материала) */
  thickness?: number;
}

/** Создать команды перегородок. */
export function createPartitionCommands(ctx: CommandContext, settleFurniture: () => void) {
  const editor = () => ctx.getState().editor;
  const find = (id: string) => editor().partitions.find((p) => p.id === id) ?? null;

  /** Применить изменение к перегородке. */
  function change(id: string, fn: (p: Partition) => Partition): void {
    const current = find(id);
    if (current) ctx.dispatch(editorActions.updatePartition(fn(current)));
  }

  /** Завершить правку стен: стыки, проёмы, подписи помещений, мебель. */
  function settle(): void {
    syncLayout(ctx);
    settleFurniture();
  }

  /** Есть ли место для ещё одной стены (иначе — сообщение). */
  function hasRoom(): boolean {
    if (editor().partitions.length < SCENE_LIMITS.partitions) return true;
    ctx.notify(`В проекте не больше ${SCENE_LIMITS.partitions} внутренних стен`);
    return false;
  }

  return {
    /**
     * Добавить перегородку на всю высоту комнаты.
     * @param center - центр на полу (по умолчанию — центр комнаты)
     */
    add(center: Vec2 = [0, 0], angle = 0): string | null {
      if (!hasRoom()) return null;
      const { dimensions, finishes } = editor();
      const id = createId('part');
      const partition = createPartition({ id, center, angle, dims: dimensions, finish: finishes.walls.front });
      ctx.dispatch(editorActions.addPartition(partition));
      ctx.dispatch(selectionActions.select({ kind: 'partition', id }));
      settle();
      return id;
    },

    /**
     * Нарисовать стену от точки до точки (концы уже привязаны вызывающим кодом).
     * @returns id новой стены или null, если стена слишком короткая
     */
    draw(start: Vec2, end: Vec2, options: WallDraftOptions = {}): string | null {
      if (length2(sub2(end, start)) < PARTITION_LIMITS.minLength) {
        ctx.notify('Стена короче 30 см — продлите её');
        return null;
      }
      if (!hasRoom()) return null;
      const { dimensions, finishes } = editor();
      const material = options.material ?? 'drywall';
      const thickness = options.thickness ?? wallMaterial(material).thickness.default;
      const id = createId('part');
      const base = createPartition({ id, center: start, dims: dimensions, finish: finishes.walls.front, material, thickness });
      ctx.dispatch(editorActions.addPartition(partitionFromEndpoints(base, start, end, dimensions)));
      ctx.dispatch(selectionActions.select({ kind: 'partition', id }));
      settle();
      return id;
    },

    /** Переместить центр (во время перетаскивания; стыки и мебель — в конце жеста). */
    move(id: string, center: Vec2): void {
      change(id, (p) => movePartition(p, center, editor().dimensions));
    },

    /** Повернуть на абсолютный угол. */
    rotate(id: string, angle: number): void {
      change(id, (p) => rotatePartition(p, angle, editor().dimensions));
    },

    /** Изменить длину, высоту или толщину. */
    resize(id: string, size: { length?: number; height?: number; thickness?: number }): void {
      change(id, (p) => resizePartition(p, size, editor().dimensions));
      settle();
    },

    /** Перестроить по концам (перетаскивание концов на плане). */
    setEndpoints(id: string, start: Vec2, end: Vec2): void {
      change(id, (p) => partitionFromEndpoints(p, start, end, editor().dimensions));
    },

    /** Отделка перегородки. */
    setFinish(id: string, finish: SurfaceFinish): void {
      change(id, (p) => ({ ...p, finish }));
    },

    /** Конструкционный материал (толщина не меняется — её задают отдельно). */
    setMaterial(id: string, material: WallMaterialId): void {
      if (isWallMaterialId(material)) change(id, (p) => ({ ...p, material }));
    },

    /** Радиус скругления углов. */
    setCornerRadius(id: string, radius: number): void {
      change(id, (p) => clampPartition({ ...p, cornerRadius: radius }, editor().dimensions));
      syncLayout(ctx);
    },

    /** Удалить перегородку. */
    remove(id: string): void {
      ctx.dispatch(editorActions.removePartition(id));
      syncLayout(ctx);
    },

    /** Завершить жест (перемещение, поворот, концы): стыки, проёмы, подписи, мебель. */
    endGesture(): void {
      settle();
    },
  };
}
