/**
 * Размещение на поверхностях опор для команд мебели: поверхности опор комнаты, выбор
 * поверхности лучом указателя (3D, VR), призраком или точкой плана (2D, клавиатура),
 * проверка предметов, которые опора переносит с собой, и снятие предметов на пол.
 * @module editor-3d/model/commands/supportPlacement
 */

import { add2, type Obb, type Vec2 } from '@/shared/lib/math/geometry2d';
import { furnitureSurfacesCache } from '@/features/furniture/surfacesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import {
  buildObstacles,
  findFreeSpot,
  furnitureFootprint,
  furnitureSubject,
  isPlacementFree,
  itemSizes,
  type PlacementObstacle,
} from '../../lib/placement';
import { carryWith, itemsOn, withoutSupport } from '../../lib/supportLinks';
import {
  findSurfaceSpot,
  placeOnSurface,
  roomSurfaces,
  supportSurfaces,
  surfaceAtPoint,
  surfaceByRay,
  type Ray3,
  type SupportSurface,
  type SurfacePlacement,
} from '../../lib/surfaces';
import { interiorRect } from '../../lib/walls';
import { placementOptions, type CommandContext } from './context';
import { fixtureObstacles } from './fixtures';

/** Куда целится пользователь при перетаскивании или размещении предмета. */
export interface SurfaceAim {
  /** Луч указателя или контроллера VR: поверхность выбирается по нему */
  ray?: Ray3;
  /** Смещение центра предмета от точки попадания луча (точка, за которую взяли предмет) */
  offset?: Vec2;
  /** Опора, на которой стоит призрак (null — пол): поставить туда же */
  supportId?: string | null;
  /** Высота поверхности, на которой стоит призрак */
  elevation?: number;
  /** Посадочное место, выбранное призраком подушки */
  socket?: string | null;
  /** Смещение центра настенного предмета от точки луча на стене (вдоль, вверх) — точка захвата */
  wallOffset?: Vec2;
}

/** Выбранная поверхность и желаемый центр предмета на ней. */
export interface SurfaceTarget {
  surface: SupportSurface;
  center: Vec2;
}

const xz = (item: FurnitureItem): Vec2 => [item.position[0], item.position[2]];
const FLOOR_OPTIONS = { gridStep: null, wallMagnet: 0 } as const;
/** Поверхности ближе этого по высоте — один уровень (та же полка), м. */
const SAME_LEVEL = 0.02;

/** Создать помощники размещения на поверхностях. */
export function createSupportPlacement(ctx: CommandContext) {
  const items = () => ctx.getState().furniture.items;
  const editor = () => ctx.getState().editor;

  /** Поверхности опор комнаты, кроме самого предмета. */
  const surfacesExcept = (itemId: string): SupportSurface[] =>
    roomSurfaces(items(), furnitureSurfacesCache.get, editor().dimensions.height, itemId);

  /** Поверхность для предмета: по лучу, по призраку или по точке плана (null — ставить на пол). */
  function target(item: FurnitureItem, center: Vec2, aim: SurfaceAim): SurfaceTarget | null {
    if (aim.supportId === null) return null;
    const surfaces = surfacesExcept(item.id);
    const { height } = itemSizes(item);
    if (aim.ray) {
      const hit = surfaceByRay(surfaces, aim.ray, height);
      return hit && { surface: hit.surface, center: add2(hit.point, aim.offset ?? [0, 0]) };
    }
    const current = item.supportId ? { supportId: item.supportId, y: item.position[1] } : null;
    const prefer = aim.supportId ? { supportId: aim.supportId, y: aim.elevation } : current;
    const surface = surfaceAtPoint(surfaces, center, height, prefer);
    return surface && { surface, center };
  }

  /** Поверхность, на которой предмет стоит сейчас. */
  function currentTarget(item: FurnitureItem): SurfaceTarget | null {
    return item.supportId ? target(item, xz(item), { supportId: item.supportId, elevation: item.position[1] }) : null;
  }

  /** Препятствия для предмета на поверхности: всё, кроме него самого и его опоры. */
  function obstaclesOn(itemId: string, supportId: string, world: readonly FurnitureItem[] = items()): PlacementObstacle[] {
    return buildObstacles(editor().partitions, [...world], itemId).filter((o) => o.id !== supportId);
  }

  const footprintAt = (item: FurnitureItem, center: Vec2, angle: number): Obb => ({ ...furnitureFootprint(item), center, angle });

  /** Поставить предмет на выбранную поверхность в точности туда, куда целятся. */
  function onSurface(item: FurnitureItem, goal: SurfaceTarget, angle: number): SurfacePlacement {
    return placeOnSurface(footprintAt(item, goal.center, angle), itemSizes(item).height, goal.surface, obstaclesOn(item.id, goal.surface.supportId));
  }

  /** Ближайшее свободное место на выбранной поверхности (null — места нет). */
  function spotOnSurface(item: FurnitureItem, goal: SurfaceTarget, angle: number): SurfacePlacement | null {
    return findSurfaceSpot(footprintAt(item, goal.center, angle), itemSizes(item).height, goal.surface, obstaclesOn(item.id, goal.surface.supportId));
  }

  /** Предмет, стоящий на поверхности по результату размещения. */
  const standing = (item: FurnitureItem, placed: SurfacePlacement): FurnitureItem => ({
    ...item,
    supportId: placed.supportId,
    position: [placed.footprint.center[0], placed.y, placed.footprint.center[1]],
    rotation: [0, placed.footprint.angle, 0],
  });

  /** Предмет без опоры на полу под тем же местом. */
  const grounded = (item: FurnitureItem): FurnitureItem => ({ ...withoutSupport(item), position: [item.position[0], 0, item.position[2]] });

  /** Снять предмет на пол: под ним же или в ближайшее свободное место (если места нет — под ним). */
  function toFloor(item: FurnitureItem, world: readonly FurnitureItem[]): FurnitureItem {
    const { dimensions, partitions } = editor();
    const down = grounded(item);
    const others = world.filter((i) => i.id !== item.id);
    const obstacles = [...buildObstacles(partitions, others), ...fixtureObstacles(ctx.getState())];
    const spot = findFreeSpot(furnitureSubject(down), interiorRect(dimensions), obstacles, FLOOR_OPTIONS);
    return spot ? { ...down, position: [spot.center[0], 0, spot.center[1]] } : down;
  }

  /** Снять предметы на пол по очереди (каждый учитывает уже снятые). */
  function dropAll(children: readonly FurnitureItem[], world: readonly FurnitureItem[]): FurnitureItem[] {
    const start = { world: [...world], dropped: [] as FurnitureItem[] };
    return children.reduce((acc, child) => {
      const down = toFloor(child, acc.world);
      return { world: [...acc.world.filter((i) => i.id !== child.id), down], dropped: [...acc.dropped, down] };
    }, start).dropped;
  }

  /**
   * Предметы на опоре после её перемещения или поворота (переносятся вместе с ней).
   * @returns null — какой-то предмет упрётся в мебель, перегородку или потолок
   */
  function carried(before: FurnitureItem, after: FurnitureItem): FurnitureItem[] | null {
    const children = itemsOn(items(), before.id);
    if (children.length === 0) return [];
    const moved = children.map((c) => carryWith(c, before, after));
    const group = new Set([before.id, ...children.map((c) => c.id)]);
    const { dimensions, partitions } = editor();
    const obstacles = [...buildObstacles(partitions, items().filter((i) => !group.has(i.id))), ...fixtureObstacles(ctx.getState())];
    const rect = interiorRect(dimensions);
    const free = (c: FurnitureItem) =>
      c.position[1] + itemSizes(c).height <= dimensions.height + 1e-6 &&
      isPlacementFree({ ...furnitureSubject(c), flat: false }, rect, obstacles, placementOptions());
    return moved.every(free) ? moved : null;
  }

  /**
   * Досадить предметы на опору после изменения её масштаба: каждый — на тот же уровень
   * (ту же полку), а не поместившийся — на пол рядом.
   */
  function refit(before: FurnitureItem, after: FurnitureItem): { items: FurnitureItem[]; dropped: number } {
    // Подушки в посадочных местах досаживает своя логика (cushionPlacement).
    const children = itemsOn(items(), before.id)
      .filter((c) => !c.socket)
      .map((c) => carryWith(c, before, after));
    const surfaces = supportSurfaces(after, furnitureSurfacesCache.get(after.modelPath), editor().dimensions.height);
    const base = items().filter((i) => i.supportId !== before.id).map((i) => (i.id === after.id ? after : i));
    return children.reduce(
      (acc, child) => {
        const world = [...base, ...acc.items];
        const { height } = itemSizes(child);
        const sameLevel = surfaces.filter((s) => Math.abs(s.y - child.position[1]) < SAME_LEVEL);
        const surface = surfaceAtPoint(sameLevel, xz(child), height, { supportId: after.id, y: child.position[1] });
        const placed = surface && placeOnSurface(furnitureFootprint(child), height, surface, obstaclesOn(child.id, after.id, world));
        if (placed?.valid) return { items: [...acc.items, standing(child, placed)], dropped: acc.dropped };
        return { items: [...acc.items, toFloor(child, world)], dropped: acc.dropped + 1 };
      },
      { items: [] as FurnitureItem[], dropped: 0 },
    );
  }

  return { target, currentTarget, onSurface, spotOnSurface, standing, grounded, toFloor, dropAll, carried, refit };
}
