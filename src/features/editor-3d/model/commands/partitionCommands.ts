/**
 * Команды перегородок: добавить, переместить, повернуть, изменить длину/высоту/толщину,
 * концы на плане, отделку, скругление углов, удалить.
 * После изменения стен мебель «досаживается», чтобы не оказаться внутри перегородки.
 * @module editor-3d/model/commands/partitionCommands
 */

import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { actions as selectionActions } from '@/features/selection/slice';
import { actions as editorActions } from '../../slice';
import {
  clampPartition,
  createPartition,
  movePartition,
  partitionFromEndpoints,
  resizePartition,
  rotatePartition,
} from '../../lib/partitions';
import { isWallMaterialId } from '../../lib/wallMaterials';
import type { Partition, SurfaceFinish, WallMaterialId } from '../../types';
import { createId, type CommandContext } from './context';

/** Создать команды перегородок. */
export function createPartitionCommands(ctx: CommandContext, settleFurniture: () => void) {
  const editor = () => ctx.getState().editor;
  const find = (id: string) => editor().partitions.find((p) => p.id === id) ?? null;

  /** Применить изменение к перегородке. */
  function change(id: string, fn: (p: Partition) => Partition): void {
    const current = find(id);
    if (current) ctx.dispatch(editorActions.updatePartition(fn(current)));
  }

  return {
    /**
     * Добавить перегородку на всю высоту комнаты.
     * @param center - центр на полу (по умолчанию — центр комнаты)
     */
    add(center: Vec2 = [0, 0], angle = 0): string {
      const { dimensions, finishes } = editor();
      const id = createId('part');
      const partition = createPartition({ id, center, angle, dims: dimensions, finish: finishes.walls.front });
      ctx.dispatch(editorActions.addPartition(partition));
      ctx.dispatch(selectionActions.select({ kind: 'partition', id }));
      settleFurniture();
      return id;
    },

    /** Переместить центр (во время перетаскивания; мебель досаживается в конце жеста). */
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
      settleFurniture();
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
    },

    /** Удалить перегородку. */
    remove(id: string): void {
      ctx.dispatch(editorActions.removePartition(id));
    },

    /** Завершить жест (перемещение/поворот): вытолкнуть мебель из стены. */
    endGesture(): void {
      settleFurniture();
    },
  };
}
