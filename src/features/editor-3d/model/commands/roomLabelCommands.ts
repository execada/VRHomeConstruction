/**
 * Команды помещений: переименовать, сменить вид (комната, лоджия, балкон).
 * Помещение задаётся точкой внутри него — как в выделении.
 * @module editor-3d/model/commands/roomLabelCommands
 */

import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { cachedRooms } from '../../lib/layoutCache';
import { nameRooms, upsertRoomLabel, type Room } from '../../lib/roomLabels';
import { roomAt } from '../../lib/rooms';
import { actions as editorActions } from '../../slice';
import type { RoomKind } from '../../types';
import { createId, type CommandContext } from './context';

/** Создать команды помещений. */
export function createRoomLabelCommands(ctx: CommandContext) {
  const editor = () => ctx.getState().editor;
  const rooms = () => nameRooms(cachedRooms(editor().dimensions, editor().partitions), editor().rooms);

  /** Изменить подпись помещения в точке. */
  function update(point: Vec2, patch: { name?: string; kind?: RoomKind }): void {
    const room = roomAt(rooms(), point);
    if (room) ctx.dispatch(editorActions.setRooms(upsertRoomLabel(editor().rooms, room, patch, createId('room'))));
  }

  return {
    /** Помещение, в котором находится точка. */
    at(point: Vec2): Room | null {
      return roomAt(rooms(), point);
    },

    /** Переименовать помещение. */
    rename(point: Vec2, name: string): void {
      update(point, { name });
    },

    /** Сменить вид помещения (лоджия и балкон считаются в площадь с коэффициентом). */
    setKind(point: Vec2, kind: RoomKind): void {
      update(point, { kind });
    },
  };
}
