/**
 * Команды мебели: размещение с привязками, перемещение, поворот, масштаб,
 * высота над полом, дублирование, удаление, «досадка» после изменения стен.
 * Предмет никогда не проникает в стены, перегородки и другую мебель.
 *
 * Небольшие предметы (лампы, вазы, книги, декор) ставятся на поверхности опор — столов,
 * полок, тумб: точно по высоте поверхности, не свисая и не пересекаясь с соседями.
 * Подушки садятся в посадочные места диванов и кресел (у спинки, на сиденье).
 * Опора переносит такие предметы с собой; при её удалении они снимаются на пол.
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
import { itemsOn, withCarried, withoutSupport } from '../../lib/supportLinks';
import { furnitureRole } from '../../lib/supportRole';
import { interiorRect } from '../../lib/walls';
import type { PlacementGhost } from '../interactionStore';
import { createId, placementOptions, type CommandContext } from './context';
import { cushionOf } from '../../lib/cushionRole';
import { createCushionPlacement, type CushionTarget } from './cushionPlacement';
import { fixtureObstacles } from './fixtures';
import { createSupportPlacement, type SurfaceAim, type SurfaceTarget } from './supportPlacement';

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

const isSurfaceItem = (item: FurnitureItem) => furnitureRole(item) === 'surface';

/** Призрак подушки в посадочном месте. */
const cushionGhost = (goal: CushionTarget): PlacementGhost => ({
  center: goal.pose.center,
  angle: goal.pose.yaw,
  valid: goal.free,
  elevation: goal.pose.y,
  supportId: goal.host.id,
  socket: goal.socket.id,
  tilt: goal.pose.tilt,
});

/** Создать команды мебели. */
export function createFurnitureCommands(ctx: CommandContext) {
  const items = () => ctx.getState().furniture.items;
  const find = (id: string) => items().find((i) => i.id === id) ?? null;
  const support = createSupportPlacement(ctx);
  const cushions = createCushionPlacement(ctx);

  /** Препятствия для предмета на полу: без него самого и без предметов на его поверхности; лестницы и вырезы в полу. */
  function floorObstacles(item: FurnitureItem) {
    const state = ctx.getState();
    return [...buildObstacles(state.editor.partitions, items().filter((i) => i.supportId !== item.id), item.id), ...fixtureObstacles(state)];
  }

  /** Разрешить положение предмета с учётом текущей сцены. */
  function resolve(item: FurnitureItem, center: Vec2, angle: number): PlacementResult {
    const { editor } = ctx.getState();
    const candidate: FurnitureItem = { ...item, position: [center[0], item.position[1], center[1]], rotation: [0, angle, 0] };
    return resolvePlacement(furnitureSubject(candidate), interiorRect(editor.dimensions), floorObstacles(item), placementOptions());
  }

  /** Свободное место рядом с желаемым (или null). */
  function freeSpot(item: FurnitureItem): Obb | null {
    const { editor } = ctx.getState();
    return findFreeSpot(furnitureSubject(item), interiorRect(editor.dimensions), floorObstacles(item), placementOptions());
  }

  const update = (item: FurnitureItem) => ctx.dispatch(furnitureActions.updateFurniture(item));

  /** Применить новое положение предмета; опора переносит предметы на своей поверхности. */
  function commit(item: FurnitureItem, next: FurnitureItem): boolean {
    const children = support.carried(item, next);
    if (children === null) return false;
    if (children.length === 0) update(next);
    else ctx.dispatch(furnitureActions.updateFurnitureItems({ id: item.id, items: [next, ...children] }));
    return true;
  }

  /** Поставить предмет на поверхность (перемещение или поворот на ней). */
  function commitOnSurface(item: FurnitureItem, goal: SurfaceTarget, angle: number): boolean {
    const placed = support.onSurface(item, goal, angle);
    if (placed.valid) update(support.standing(item, placed));
    return placed.valid;
  }

  /** Переместить небольшой предмет: на поверхность под указателем, иначе — на пол. */
  function moveSurfaceItem(item: FurnitureItem, center: Vec2, aim: SurfaceAim): boolean {
    const goal = support.target(item, center, aim);
    if (goal) return commitOnSurface(item, goal, item.rotation[1]);
    const free = item.supportId ? support.grounded(item) : item;
    const result = resolve(free, center, item.rotation[1]);
    if (result.valid) update(at(free, result.footprint));
    return result.valid;
  }

  /**
   * Переместить предмет (перетаскивание, план, клавиатура, инспектор).
   * @param id - предмет
   * @param center - желаемый центр на плане
   * @param aim - луч указателя или призрак: куда целится пользователь (для поверхностей опор)
   * @returns false, если место недоступно
   */
  function move(id: string, center: Vec2, aim: SurfaceAim = {}): boolean {
    const item = find(id);
    if (!item || item.locked) return false;
    const seat = cushionOf(item) ? cushions.target(item, center, aim) : null;
    if (seat) {
      if (seat.free) update(cushions.seat(item, seat));
      return seat.free;
    }
    if (isSurfaceItem(item)) return moveSurfaceItem(item, center, aim);
    // Подушку стянули с дивана — она ложится на пол без наклона.
    const base = item.supportId ? support.grounded(item) : item;
    const result = resolve(base, center, base.rotation[1]);
    return result.valid && commit(item, at(base, result.footprint));
  }

  /** Повернуть предмет на абсолютный угол. */
  function rotate(id: string, angle: number): boolean {
    const item = find(id);
    if (!item || item.locked) return false;
    if (item.socket) {
      const turned = cushions.twist(item, angle);
      if (turned) update(turned);
      return turned !== null;
    }
    const goal = support.currentTarget(item);
    if (goal) return commitOnSurface(item, goal, angle);
    const result = resolve(item, [item.position[0], item.position[2]], angle);
    return result.valid && commit(item, at(item, result.footprint));
  }

  /** Угол для новой модели: заданный пользователем или «спиной к ближайшей стене». */
  function placingAngle(item: FurnitureItem, center: Vec2, angle: number | null): number {
    if (angle !== null) return angle;
    const { dimensions } = ctx.getState().editor;
    return autoOrientAngle(center, itemSizes(item).halfDepth, dimensions) ?? 0;
  }

  /** Новый предмет на поверхности опоры (undefined — не над опорой, null — на поверхности нет места). */
  function placedOnSurface(draft: FurnitureItem, center: Vec2, angle: number | null, aim: SurfaceAim): FurnitureItem | null | undefined {
    const goal = isSurfaceItem(draft) ? support.target(draft, center, aim) : null;
    if (!goal) return undefined;
    const placed = support.spotOnSurface(draft, goal, angle ?? goal.surface.area.angle);
    return placed ? support.standing(draft, placed) : null;
  }

  /** Новый предмет на полу (null — в комнате нет места). */
  function placedOnFloor(draft: FurnitureItem, center: Vec2, angle: number | null): FurnitureItem | null {
    const direct = resolve(draft, center, placingAngle(draft, center, angle));
    const footprint = direct.valid ? direct.footprint : freeSpot(at(draft, direct.footprint));
    return footprint ? at(draft, footprint) : null;
  }

  /** Добавить предмет и выделить его. */
  function add(item: FurnitureItem): string {
    ctx.dispatch(furnitureActions.addFurniture(item));
    ctx.dispatch(selectionActions.select({ kind: 'furniture', id: item.id }));
    return item.id;
  }

  /** Масштаб предмета на поверхности: он должен поместиться на ту же поверхность. */
  function scaleOnSurface(scaled: FurnitureItem, goal: SurfaceTarget): boolean {
    const placed = support.onSurface(scaled, goal, scaled.rotation[1]);
    if (!placed.valid) {
      ctx.notify('Предмет такого размера не помещается на поверхности');
      return false;
    }
    update(support.standing(scaled, placed));
    return true;
  }

  /** Масштаб предмета на полу; предметы на опоре досаживаются на её новую поверхность. */
  function scaleOnFloor(item: FurnitureItem, scaled: FurnitureItem): boolean {
    const result = resolve(scaled, [item.position[0], item.position[2]], item.rotation[1]);
    const footprint = result.valid ? result.footprint : freeSpot(scaled);
    if (!footprint) {
      ctx.notify('Предмет такого размера не помещается в комнате');
      return false;
    }
    const next = at(scaled, footprint);
    const fit = support.refit(item, next);
    const children = [...fit.items, ...cushions.reseatAll(item, next)];
    if (children.length === 0) update(next);
    else ctx.dispatch(furnitureActions.updateFurnitureItems({ id: item.id, items: [next, ...children] }));
    if (fit.dropped > 0) ctx.notify(`Не поместились на поверхности и сняты на пол: ${fit.dropped}`);
    return true;
  }

  return {
    /** Призрак размещения модели под курсором (на полу или на поверхности опоры). */
    previewPlacement(path: string, center: Vec2, angle: number | null, options: { name?: string; aim?: SurfaceAim } = {}): PlacementGhost {
      const draft = draftItem(path, options.name ?? '');
      const seat = cushionOf(draft) ? cushions.target(draft, center, options.aim ?? {}) : null;
      if (seat) return cushionGhost(seat);
      const goal = isSurfaceItem(draft) ? support.target(draft, center, options.aim ?? {}) : null;
      if (goal) {
        const placed = support.onSurface(draft, goal, angle ?? goal.surface.area.angle);
        const { center: c, angle: a } = placed.footprint;
        return { center: c, angle: a, valid: placed.valid, elevation: placed.y, supportId: placed.supportId };
      }
      const result = resolve(draft, center, placingAngle(draft, center, angle));
      return { center: result.footprint.center, angle: result.footprint.angle, valid: result.valid, elevation: 0, supportId: null };
    },

    /**
     * Поставить новую модель. Если место занято — в ближайшее свободное (на той же поверхности).
     * @param path - путь модели
     * @param name - название из каталога
     * @param center - желаемый центр на плане
     * @param angle - поворот (null — автоматически: к стене или как у опоры)
     * @param aim - куда целится пользователь (призрак: опора и высота поверхности, или луч)
     * @returns id нового предмета или null, если места нет
     */
    place(path: string, name: string, center: Vec2, angle: number | null, aim: SurfaceAim = {}): string | null {
      const draft = draftItem(path, name);
      const seat = cushionOf(draft) ? cushions.target(draft, center, aim) : null;
      if (seat && !seat.free) {
        ctx.notify('Все места для подушек здесь заняты');
        return null;
      }
      if (seat) return add({ ...cushions.seat(draft, seat), id: createId('furn') });
      const onSurface = placedOnSurface(draft, center, angle, aim);
      if (onSurface === null) {
        ctx.notify('На этой поверхности нет свободного места');
        return null;
      }
      const item = onSurface ?? placedOnFloor(draft, center, angle);
      if (!item) {
        ctx.notify('В комнате нет свободного места для этого предмета');
        return null;
      }
      return add({ ...item, id: createId('furn') });
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

    /** Масштаб (с проверкой, что предмет помещается — в комнате или на своей поверхности). */
    setScale(id: string, scale: number): boolean {
      const item = find(id);
      if (!item) return false;
      const scaled = { ...item, scale: clamp(scale, MIN_SCALE, MAX_SCALE) };
      if (item.socket) {
        const resized = cushions.resize(item, scaled);
        if (resized) update(resized);
        else ctx.notify('Подушка такого размера не помещается на этом месте');
        return resized !== null;
      }
      const goal = support.currentTarget(item);
      return goal ? scaleOnSurface(scaled, goal) : scaleOnFloor(item, scaled);
    },

    /**
     * Высота низа предмета над полом (полки, картины). 0 — на полу.
     * Предмет на поверхности опоры снимается с неё; опора поднимает предметы на себе.
     */
    setElevation(id: string, elevation: number): void {
      const item = find(id);
      if (!item) return;
      const { height } = ctx.getState().editor.dimensions;
      const own = itemSizes(item).height;
      if (item.supportId) {
        update({ ...withoutSupport(item), position: [item.position[0], clamp(elevation, 0, Math.max(0, height - own)), item.position[2]] });
        return;
      }
      const reach = itemsOn(items(), id).reduce((max, c) => Math.max(max, c.position[1] - item.position[1] + itemSizes(c).height), own);
      const next: FurnitureItem = { ...item, position: [item.position[0], clamp(elevation, 0, Math.max(0, height - reach)), item.position[2]] };
      if (!commit(item, next)) ctx.notify('Предметы на поверхности упрутся в другую мебель');
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

    /** Дублировать рядом (предмет на поверхности — на ту же поверхность). @returns id копии */
    duplicate(id: string): string | null {
      const item = find(id);
      if (!item) return null;
      const copy: FurnitureItem = { ...item, id: createId('furn'), locked: false };
      const seatedCopy = item.socket ? cushions.nextSeat(item, copy) : null;
      if (seatedCopy) return add(seatedCopy);
      const goal = support.currentTarget(item);
      const onSurface = goal && support.spotOnSurface(copy, goal, copy.rotation[1]);
      if (onSurface) return add(support.standing(copy, onSurface));
      const base = item.supportId ? support.grounded(copy) : copy;
      const shifted: FurnitureItem = { ...base, position: [base.position[0] + DUPLICATE_OFFSET, base.position[1], base.position[2] + DUPLICATE_OFFSET] };
      const footprint = freeSpot(shifted);
      if (!footprint) {
        ctx.notify('Нет места для копии');
        return null;
      }
      return add(at(shifted, footprint));
    },

    /** Удалить предмет. Предметы с поверхности удалённой опоры снимаются на пол (не висят в воздухе). */
    remove(id: string): void {
      const children = itemsOn(items(), id);
      ctx.dispatch(furnitureActions.removeFurniture(id));
      if (children.length === 0) return;
      ctx.dispatch(furnitureActions.updateFurnitureItems({ id, items: support.dropAll(children, items()) }));
      ctx.notify(`Предметы с поверхности перенесены на пол: ${children.length}`);
    },

    /** Снять предмет с поверхности опоры на пол рядом с ней. */
    dropToFloor(id: string): void {
      const item = find(id);
      if (item?.supportId) update(support.toFloor(item, items()));
    },

    /**
     * «Досадить» мебель после изменения перегородок: предметы, оказавшиеся
     * внутри стен, выталкиваются в ближайшее свободное место; предметы на опорах едут с ними.
     */
    settle(): void {
      const state = ctx.getState();
      const { editor } = state;
      const rect = interiorRect(editor.dimensions);
      const options = placementOptions();
      const current = items();
      const fixtures = fixtureObstacles(state);
      const floor = current.filter((i) => !i.supportId).reduce<FurnitureItem[]>((placed, item) => {
        const subject = furnitureSubject(item);
        const obstacles = [...buildObstacles(editor.partitions, placed, item.id), ...fixtures];
        const result = resolvePlacement(subject, rect, obstacles, { ...options, gridStep: null, wallMagnet: 0 });
        const footprint = result.valid ? result.footprint : findFreeSpot(subject, rect, obstacles, options) ?? result.footprint;
        return [...placed, at(item, footprint)];
      }, []);
      const settled = withCarried(current, floor);
      const moved = settled.some((s, i) => s.position.some((v, k) => v !== current[i].position[k]));
      if (moved) ctx.dispatch(furnitureActions.replaceFurniture(settled));
    },
  };
}
