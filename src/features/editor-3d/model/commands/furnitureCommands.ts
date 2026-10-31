/**
 * Команды мебели: размещение с привязками, перемещение, поворот, масштаб,
 * высота над полом, дублирование, удаление, «досадка» после изменения стен.
 * Предмет никогда не проникает в стены, перегородки и другую мебель.
 * @module editor-3d/model/commands/furnitureCommands
 */

import { clamp, type Obb, type Vec2 } from '@/shared/lib/math/geometry2d';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { actions as selectionActions } from '@/features/selection/slice';
import {
  autoOrientAngle,
  buildObstacles,
  findFreeSpot,
  furnitureSubject,
  itemSizes,
  resolvePlacement,
  type PlacementResult,
} from '../../lib/placement';
import { interiorRect } from '../../lib/walls';
import type { PlacementGhost } from '../interactionStore';
import { createId, placementOptions, type CommandContext } from './context';

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const DUPLICATE_OFFSET = 0.35;

/** Черновик предмета для расчёта размещения (до добавления в сцену). */
function draftItem(path: string, name: string): FurnitureItem {
  const sizes = furnitureSizesCache.get(path);
  return {
    id: '__draft__',
    name,
    modelPath: path,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    halfWidth: sizes?.halfWidth,
    halfDepth: sizes?.halfDepth,
    height: sizes?.height,
  };
}

const at = (item: FurnitureItem, footprint: Obb): FurnitureItem => ({
  ...item,
  position: [footprint.center[0], item.position[1], footprint.center[1]],
  rotation: [0, footprint.angle, 0],
});

/** Создать команды мебели. */
export function createFurnitureCommands(ctx: CommandContext) {
  const items = () => ctx.getState().furniture.items;
  const find = (id: string) => items().find((i) => i.id === id) ?? null;

  /** Разрешить положение предмета с учётом текущей сцены. */
  function resolve(item: FurnitureItem, center: Vec2, angle: number): PlacementResult {
    const { editor } = ctx.getState();
    const candidate: FurnitureItem = { ...item, position: [center[0], item.position[1], center[1]], rotation: [0, angle, 0] };
    return resolvePlacement(
      furnitureSubject(candidate),
      interiorRect(editor.dimensions),
      buildObstacles(editor.partitions, items(), item.id),
      placementOptions(),
    );
  }

  /** Свободное место рядом с желаемым (или null). */
  function freeSpot(item: FurnitureItem): Obb | null {
    const { editor } = ctx.getState();
    return findFreeSpot(furnitureSubject(item), interiorRect(editor.dimensions), buildObstacles(editor.partitions, items(), item.id), placementOptions());
  }

  const update = (item: FurnitureItem) => ctx.dispatch(furnitureActions.updateFurniture(item));

  /** Переместить предмет (перетаскивание). @returns false, если место недоступно */
  function move(id: string, center: Vec2): boolean {
    const item = find(id);
    if (!item || item.locked) return false;
    const result = resolve(item, center, item.rotation[1]);
    if (result.valid) update(at(item, result.footprint));
    return result.valid;
  }

  /** Повернуть предмет на абсолютный угол. */
  function rotate(id: string, angle: number): boolean {
    const item = find(id);
    if (!item || item.locked) return false;
    const result = resolve(item, [item.position[0], item.position[2]], angle);
    if (result.valid) update(at(item, result.footprint));
    return result.valid;
  }

  /** Угол для новой модели: заданный пользователем или «спиной к ближайшей стене». */
  function placingAngle(item: FurnitureItem, center: Vec2, angle: number | null): number {
    if (angle !== null) return angle;
    const { dimensions } = ctx.getState().editor;
    return autoOrientAngle(center, itemSizes(item).halfDepth, dimensions) ?? 0;
  }

  return {
    /** Призрак размещения модели под курсором. */
    previewPlacement(path: string, center: Vec2, angle: number | null): PlacementGhost {
      const draft = draftItem(path, '');
      const result = resolve(draft, center, placingAngle(draft, center, angle));
      return { center: result.footprint.center, angle: result.footprint.angle, valid: result.valid };
    },

    /**
     * Поставить новую модель. Если место занято — в ближайшее свободное.
     * @returns id нового предмета или null, если места в комнате нет
     */
    place(path: string, name: string, center: Vec2, angle: number | null): string | null {
      const draft = draftItem(path, name);
      const direct = resolve(draft, center, placingAngle(draft, center, angle));
      const footprint = direct.valid ? direct.footprint : freeSpot(at(draft, direct.footprint));
      if (!footprint) {
        ctx.notify('В комнате нет свободного места для этого предмета');
        return null;
      }
      const id = createId('furn');
      ctx.dispatch(furnitureActions.addFurniture({ ...at(draft, footprint), id }));
      ctx.dispatch(selectionActions.select({ kind: 'furniture', id }));
      return id;
    },

    move,
    rotate,

    /** Повернуть предмет на угол относительно текущего. */
    rotateBy(id: string, delta: number): boolean {
      const item = find(id);
      return item ? rotate(id, item.rotation[1] + delta) : false;
    },

    /** Сдвинуть предмет на dx, dz (стрелки клавиатуры). */
    nudge(id: string, dx: number, dz: number): boolean {
      const item = find(id);
      return item ? move(id, [item.position[0] + dx, item.position[2] + dz]) : false;
    },

    /** Масштаб (с проверкой, что предмет помещается). */
    setScale(id: string, scale: number): boolean {
      const item = find(id);
      if (!item) return false;
      const scaled = { ...item, scale: clamp(scale, MIN_SCALE, MAX_SCALE) };
      const result = resolve(scaled, [item.position[0], item.position[2]], item.rotation[1]);
      const footprint = result.valid ? result.footprint : freeSpot(scaled);
      if (!footprint) {
        ctx.notify('Предмет такого размера не помещается в комнате');
        return false;
      }
      update(at(scaled, footprint));
      return true;
    },

    /** Высота низа предмета над полом (полки, картины). 0 — на полу. */
    setElevation(id: string, elevation: number): void {
      const item = find(id);
      if (!item) return;
      const { height } = ctx.getState().editor.dimensions;
      const top = Math.max(0, height - itemSizes(item).height);
      update({ ...item, position: [item.position[0], clamp(elevation, 0, top), item.position[2]] });
    },

    /** Цвет тонирования (null — исходные материалы). */
    setColor(id: string, color: string | null): void {
      const item = find(id);
      if (item) update({ ...item, color });
    },

    /** Закрепить / открепить предмет. */
    toggleLock(id: string): void {
      const item = find(id);
      if (item) update({ ...item, locked: !item.locked });
    },

    /** Дублировать рядом. @returns id копии */
    duplicate(id: string): string | null {
      const item = find(id);
      if (!item) return null;
      const copy: FurnitureItem = {
        ...item,
        id: createId('furn'),
        locked: false,
        position: [item.position[0] + DUPLICATE_OFFSET, item.position[1], item.position[2] + DUPLICATE_OFFSET],
      };
      const footprint = freeSpot(copy);
      if (!footprint) {
        ctx.notify('Нет места для копии');
        return null;
      }
      ctx.dispatch(furnitureActions.addFurniture(at(copy, footprint)));
      ctx.dispatch(selectionActions.select({ kind: 'furniture', id: copy.id }));
      return copy.id;
    },

    /** Удалить предмет. */
    remove(id: string): void {
      ctx.dispatch(furnitureActions.removeFurniture(id));
    },

    /**
     * «Досадить» мебель после изменения перегородок: предметы, оказавшиеся
     * внутри стен, выталкиваются в ближайшее свободное место.
     */
    settle(): void {
      const { editor } = ctx.getState();
      const rect = interiorRect(editor.dimensions);
      const options = placementOptions();
      const current = items();
      const settled = current.reduce<FurnitureItem[]>((placed, item) => {
        const subject = furnitureSubject(item);
        const obstacles = buildObstacles(editor.partitions, placed, item.id);
        const result = resolvePlacement(subject, rect, obstacles, { ...options, gridStep: null, wallMagnet: 0 });
        const footprint = result.valid ? result.footprint : findFreeSpot(subject, rect, obstacles, options) ?? result.footprint;
        return [...placed, at(item, footprint)];
      }, []);
      const moved = settled.some((s, i) => s.position[0] !== current[i].position[0] || s.position[2] !== current[i].position[2]);
      if (moved) ctx.dispatch(furnitureActions.replaceFurniture(settled));
    },
  };
}
