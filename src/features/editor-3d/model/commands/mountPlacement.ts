/**
 * Настенные и потолочные предметы для команд мебели. Стена выбирается лучом указателя (3D, VR)
 * или по точке плана (2D, клавиатура, инспектор, VR-меню); новый предмет вешается на высоту из
 * каталога, перетаскивание ведёт его вдоль стены и по высоте, а без луча — вдоль ближайшей стены
 * на прежней высоте. Потолочный предмет висит под потолком. Предмет не заходит в проёмы, за торцы
 * и выше стены и не пересекается с мебелью; если стены рядом нет или места нет — положение
 * недопустимо (призрак красный, команда отказывается). После правки стен и размеров комнаты
 * предмет пересаживается на свою грань (FurnitureItem.mount).
 * @module editor-3d/model/commands/mountPlacement
 */

import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { mountHeight } from '@/features/furniture/lib/attachType';
import type { FurnitureItem } from '@/features/furniture/types';
import { attachOf } from '../../lib/attachRole';
import { buildObstacles, isPlacementFree, itemSizes, resolvePlacement, type PlacementObstacle, type PlacementSubject } from '../../lib/placement';
import type { Ray3 } from '../../lib/surfaces';
import { faceByRay, nearestFace, resolveOnFace, wallFaces, type WallFace, type WallPose } from '../../lib/wallMount';
import { interiorRect, worldToWall } from '../../lib/walls';
import { DRAFT_ITEM_ID, placementOptions, type CommandContext } from './context';
import { fixtureObstacles } from './fixtures';

/** Потолок как место подвеса. */
export const CEILING = 'ceiling';

/** Куда целится пользователь. */
export interface MountAim {
  /** Луч указателя или контроллера VR */
  ray?: Ray3;
  /** Смещение центра предмета от точки луча на стене (вдоль, вверх) — точка, за которую взяли */
  wallOffset?: Vec2;
  /** Высота низа (призрак, инспектор): без луча предмет висит на этой высоте */
  elevation?: number;
}

/** Положение настенного или потолочного предмета. */
export interface MountTarget {
  kind: 'wall' | 'ceiling';
  pose: WallPose;
  valid: boolean;
  /** Грань стены или 'ceiling' (null — стены рядом нет) */
  mount: string | null;
}

const FREE = { gridStep: null, wallMagnet: 0 } as const;

/** Предмет в положении подвеса. */
export function mountedAt(item: FurnitureItem, target: MountTarget): FurnitureItem {
  return {
    ...item,
    position: [target.pose.center[0], target.pose.elevation, target.pose.center[1]],
    rotation: [0, target.pose.angle, 0],
    ...(target.mount ? { mount: target.mount } : {}),
  };
}

/** Сообщение, почему предмет нельзя повесить сюда. */
export function mountProblem(target: MountTarget): string {
  if (target.kind === 'ceiling') return 'Под потолком здесь нет места для этого предмета';
  return target.mount ? 'На этой стене нет свободного места для предмета' : 'Настенный предмет вешается на стену — наведите курсор на стену';
}

/** Создать помощники подвеса. */
export function createMountPlacement(ctx: CommandContext) {
  const state = () => ctx.getState();

  /** Препятствия: перегородки, мебель (кроме предмета и того, что стоит на нём), лестницы. */
  function obstaclesFor(item: FurnitureItem): PlacementObstacle[] {
    const { editor, furniture } = state();
    return [...buildObstacles(editor.partitions, furniture.items.filter((i) => i.supportId !== item.id), item.id), ...fixtureObstacles(state())];
  }

  /** Проверка, свободно ли положение настенного предмета. */
  function freeCheck(item: FurnitureItem): (pose: WallPose) => boolean {
    const sizes = itemSizes(item);
    const obstacles = obstaclesFor(item);
    const rect = interiorRect(state().editor.dimensions);
    return (pose) => {
      const subject: PlacementSubject = {
        footprint: { center: pose.center, half: [sizes.halfWidth, sizes.halfDepth], angle: pose.angle },
        yRange: [pose.elevation, pose.elevation + sizes.height],
        flat: false,
      };
      return isPlacementFree(subject, rect, obstacles, FREE);
    };
  }

  /** Высота низа нового настенного предмета: центр на высоте из каталога. */
  const defaultBottom = (item: FurnitureItem) => mountHeight(item.modelPath) - itemSizes(item).height / 2;

  /** Грань и место на ней, куда целится пользователь (null — стены рядом нет). */
  function wallSpot(item: FurnitureItem, center: Vec2, aim: MountAim): { face: WallFace; u: number; bottom: number } | null {
    const faces = wallFaces(state().editor);
    const isDraft = item.id === DRAFT_ITEM_ID;
    const hit = aim.ray ? faceByRay(faces, aim.ray) : null;
    if (hit) {
      const [du, dv] = aim.wallOffset ?? [0, 0];
      return { face: hit.face, u: hit.u + du, bottom: isDraft ? defaultBottom(item) : hit.v + dv - itemSizes(item).height / 2 };
    }
    const near = nearestFace(faces, center);
    if (!near) return null;
    return { face: near.face, u: near.u, bottom: aim.elevation ?? (isDraft ? defaultBottom(item) : item.position[1]) };
  }

  function onWall(item: FurnitureItem, center: Vec2, aim: MountAim): MountTarget {
    const spot = wallSpot(item, center, aim);
    if (!spot) return { kind: 'wall', pose: { center, angle: item.rotation[1], elevation: aim.elevation ?? Math.max(0, item.position[1]) }, valid: false, mount: null };
    const resolved = resolveOnFace(spot.face, itemSizes(item), spot.u, spot.bottom, freeCheck(item));
    return { kind: 'wall', pose: resolved.pose, valid: resolved.valid, mount: spot.face.frame.id };
  }

  function onCeiling(item: FurnitureItem, center: Vec2, angle: number): MountTarget {
    const { dimensions } = state().editor;
    const sizes = itemSizes(item);
    const bottom = dimensions.height - sizes.height;
    const subject: PlacementSubject = {
      footprint: { center, half: [sizes.halfWidth, sizes.halfDepth], angle },
      yRange: [Math.max(0, bottom), dimensions.height],
      flat: false,
    };
    const result = resolvePlacement(subject, interiorRect(dimensions), obstaclesFor(item), { ...placementOptions(), wallMagnet: 0 });
    return { kind: 'ceiling', pose: { center: result.footprint.center, angle, elevation: Math.max(0, bottom) }, valid: result.valid && bottom >= 0, mount: CEILING };
  }

  /**
   * Положение настенного или потолочного предмета.
   * @param item - предмет (новый — черновик из каталога)
   * @param center - точка плана под указателем
   * @param angle - поворот (у потолочного; настенный поворачивает стена)
   * @param aim - луч указателя, смещение захвата или высота
   * @returns null — предмет стоит на полу или на поверхности
   */
  function target(item: FurnitureItem, center: Vec2, angle: number, aim: MountAim = {}): MountTarget | null {
    const attach = attachOf(item);
    if (attach === 'wall') return onWall(item, center, aim);
    if (attach === 'ceiling') return onCeiling(item, center, angle);
    return null;
  }

  /**
   * Пересадить подвешенный предмет после правки стен или размеров комнаты: настенный — на свою
   * грань (если её нет — на ближайшую стену), потолочный — под новый потолок.
   * @returns новое положение или null (предмет не подвешен)
   */
  function remount(item: FurnitureItem): FurnitureItem | null {
    if (!item.mount) return null;
    const center: Vec2 = [item.position[0], item.position[2]];
    if (item.mount === CEILING) return mountedAt(item, onCeiling(item, center, item.rotation[1]));
    const faces = wallFaces(state().editor);
    const own = faces.find((f) => f.frame.id === item.mount);
    const spot = own ? { face: own, u: worldToWall(own.frame, [center[0], 0, center[1]]).u } : nearestFace(faces, center, Infinity);
    if (!spot) return null;
    const resolved = resolveOnFace(spot.face, itemSizes(item), spot.u, item.position[1], freeCheck(item));
    return mountedAt(item, { kind: 'wall', pose: resolved.pose, valid: resolved.valid, mount: spot.face.frame.id });
  }

  return { target, remount };
}
