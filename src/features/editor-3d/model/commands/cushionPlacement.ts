/**
 * Подушки на диванах и креслах для команд мебели: какая модель под указателем (луч в 3D и VR,
 * точка плана в 2D), в какое посадочное место сядет подушка, доворот подушки в месте, масштаб
 * подушки и пересадка подушек после масштаба дивана. Диван — опора подушки (supportId):
 * перемещение, поворот и удаление дивана переносят и снимают подушки как предметы на опоре.
 * @module editor-3d/model/commands/cushionPlacement
 */

import type { Vec2 } from '@/shared/lib/math/geometry2d';
import type { CushionSocket, CushionStyle } from '@/features/furniture/lib/cushions';
import type { FurnitureItem } from '@/features/furniture/types';
import { cushionOf, socketsOf } from '../../lib/cushionRole';
import {
  chooseSeat,
  currentTwist,
  cushionBox,
  cushionsCollide,
  fitsHost,
  hostUnderAim,
  itemBox,
  seated,
  socketPose,
  twistedPose,
  type CushionHost,
  type CushionPose,
} from '../../lib/cushionSeats';
import type { CommandContext } from './context';
import type { SurfaceAim } from './supportPlacement';

/** Куда сядет подушка: модель, место и положение (free = false — свободных мест нет). */
export interface CushionTarget {
  host: FurnitureItem;
  socket: CushionSocket;
  pose: CushionPose;
  free: boolean;
}

const xz = (item: FurnitureItem): Vec2 => [item.position[0], item.position[2]];

/** Создать помощники посадки подушек. */
export function createCushionPlacement(ctx: CommandContext) {
  const items = () => ctx.getState().furniture.items;
  const find = (id: string | undefined) => (id ? (items().find((i) => i.id === id) ?? null) : null);

  /** Диваны и кресла комнаты с местами (кроме самой подушки и предметов на опорах). */
  const hosts = (exceptId: string): CushionHost[] =>
    items()
      .filter((i) => i.id !== exceptId && !i.supportId)
      .flatMap((item) => {
        const sockets = socketsOf(item);
        return sockets.length > 0 ? [{ item, sockets }] : [];
      });

  /** Другие подушки в местах модели. */
  const neighboursOn = (hostId: string, exceptId: string) => items().filter((i) => i.supportId === hostId && i.socket && i.id !== exceptId);

  /**
   * Куда сядет подушка (null — не над диваном или креслом, либо не садится ни в одно место).
   * @param cushion - подушка (новая или перетаскиваемая)
   * @param center - точка плана под указателем
   * @param aim - луч указателя или выбор призрака
   */
  function target(cushion: FurnitureItem, center: Vec2, aim: SurfaceAim): CushionTarget | null {
    const style = cushionOf(cushion);
    if (!style || aim.supportId === null) return null;
    const list = hosts(cushion.id);
    const chosen = aim.supportId ? list.find((h) => h.item.id === aim.supportId) : undefined;
    const hit = chosen ? { host: chosen, point: center } : hostUnderAim(list, center, aim.ray);
    if (!hit) return null;
    const prefer = aim.socket ?? (cushion.supportId === hit.host.item.id ? cushion.socket : undefined);
    const choice = chooseSeat(hit.host, cushion, style, hit.point, neighboursOn(hit.host.item.id, cushion.id), prefer);
    return choice && { host: hit.host.item, ...choice };
  }

  /** Подушка, посаженная в выбранное место. */
  const seat = (cushion: FurnitureItem, goal: CushionTarget): FurnitureItem => seated(cushion, goal.host, goal.socket.id, goal.pose);

  /** Модель, место и способ посадки подушки, которая уже сидит. */
  function seating(cushion: FurnitureItem): { host: FurnitureItem; socket: CushionSocket; style: CushionStyle } | null {
    const host = find(cushion.supportId);
    const socket = host ? socketsOf(host).find((s) => s.id === cushion.socket) : undefined;
    const style = cushionOf(cushion);
    return host && socket && style ? { host, socket, style } : null;
  }

  /** Подушка в положении, если она помещается и не сталкивается с соседями. */
  function placedIfFree(cushion: FurnitureItem, host: FurnitureItem, socketId: string, pose: CushionPose | null): FurnitureItem | null {
    if (!pose) return null;
    const box = cushionBox(cushion, pose);
    const blocked = neighboursOn(host.id, cushion.id).some((n) => cushionsCollide(box, itemBox(n)));
    return fitsHost(box, host) && !blocked ? seated(cushion, host, socketId, pose) : null;
  }

  /** Повернуть сидящую подушку на абсолютный угол (лёгкий доворот в месте). @returns null — не получилось */
  function twist(cushion: FurnitureItem, angle: number): FurnitureItem | null {
    const at = seating(cushion);
    return at && placedIfFree(cushion, at.host, at.socket.id, twistedPose(at.host, at.socket, cushion, at.style, angle));
  }

  /** Сидящая подушка с другим масштабом (в том же месте). @returns null — не помещается */
  function resize(cushion: FurnitureItem, scaled: FurnitureItem): FurnitureItem | null {
    const at = seating(cushion);
    if (!at) return null;
    const pose = socketPose(at.host, at.socket, scaled, at.style, currentTwist(cushion, at.host, at.socket));
    return placedIfFree(scaled, at.host, at.socket.id, pose);
  }

  /**
   * Подушки дивана после изменения его масштаба: каждая — в своё место с тем же доворотом
   * (места раздвигаются или сдвигаются вместе с диваном).
   */
  function reseatAll(before: FurnitureItem, after: FurnitureItem): FurnitureItem[] {
    const sockets = socketsOf(after);
    return neighboursOn(before.id, '').flatMap((cushion) => {
      const socket = sockets.find((s) => s.id === cushion.socket);
      const style = cushionOf(cushion);
      if (!socket || !style) return [];
      const pose = socketPose(after, socket, cushion, style, currentTwist(cushion, before, socket));
      return pose ? [seated(cushion, after, socket.id, pose)] : [];
    });
  }

  /** Свободное место для копии подушки на той же модели (рядом с оригиналом) или null. */
  function nextSeat(original: FurnitureItem, copy: FurnitureItem): FurnitureItem | null {
    const goal = original.supportId ? target(copy, xz(original), { supportId: original.supportId }) : null;
    return goal?.free ? seat(copy, goal) : null;
  }

  return { target, seat, twist, resize, reseatAll, nextSeat };
}
