/**
 * Команды проёмов: создать окно/дверь, перемещать вдоль стены, менять ширину, высоту,
 * отступ от пола и тип, удалять. Работают одинаково для внешних стен и перегородок.
 * @module editor-3d/model/commands/openingCommands
 */

import { actions as editorActions } from '../../slice';
import { actions as selectionActions } from '@/features/selection/slice';
import {
  clampOpening,
  createOpening,
  moveOpening,
  OPENING_DEFAULTS,
  openingSill,
  resizeOpening,
  withSill,
  type OpeningHost,
} from '../../lib/openings';
import { isWallSide, wallFrame } from '../../lib/walls';
import type { Opening, Partition } from '../../types';
import { createId, type CommandContext } from './context';

/** Стена или перегородка с её проёмами. */
interface HostInfo {
  host: OpeningHost;
  list: Opening[];
  partition: Partition | null;
}

const OPENING_LABEL: Record<Opening['type'], string> = { window: 'окна', door: 'двери' };

/** Создать команды проёмов. */
export function createOpeningCommands(ctx: CommandContext) {
  /** Найти стену/перегородку по id. */
  function hostInfo(hostId: string): HostInfo | null {
    const { editor } = ctx.getState();
    if (isWallSide(hostId)) {
      if (editor.removedWalls.includes(hostId)) return null;
      const frame = wallFrame(hostId, editor.dimensions);
      return { host: { length: frame.length, height: frame.height }, list: editor.openings[hostId] ?? [], partition: null };
    }
    const partition = editor.partitions.find((p) => p.id === hostId);
    return partition ? { host: { length: partition.size[0], height: partition.size[1] }, list: partition.openings, partition } : null;
  }

  /** Записать изменённый проём. */
  function write(hostId: string, info: HostInfo, opening: Opening) {
    if (info.partition) {
      const openings = info.list.map((o) => (o.id === opening.id ? opening : o));
      ctx.dispatch(editorActions.updatePartition({ ...info.partition, openings }));
    } else {
      ctx.dispatch(editorActions.updateOpening({ wallId: hostId, opening }));
    }
  }

  /** Применить преобразование к проёму. */
  function change(hostId: string, id: string, fn: (o: Opening, info: HostInfo, others: Opening[]) => Opening) {
    const info = hostInfo(hostId);
    const current = info?.list.find((o) => o.id === id);
    if (!info || !current) return;
    write(hostId, info, fn(current, info, info.list.filter((o) => o.id !== id)));
  }

  return {
    /**
     * Создать окно или дверь в ближайшем свободном месте стены.
     * @returns проём или null (нет места / стена удалена)
     */
    add(hostId: string, type: Opening['type'], preferredU = 0): Opening | null {
      const info = hostInfo(hostId);
      if (!info) return null;
      const opening = createOpening({ id: createId(type), type, wallId: hostId, host: info.host, others: info.list, preferredU });
      if (!opening) {
        ctx.notify(`На этой стене нет места для ${OPENING_LABEL[type]}`);
        return null;
      }
      if (info.partition) {
        ctx.dispatch(editorActions.addOpeningToPartition({ partitionId: hostId, opening }));
      } else {
        ctx.dispatch(editorActions.addOpening({ wallId: hostId, opening }));
      }
      ctx.dispatch(selectionActions.select({ kind: 'opening', hostId, id: opening.id }));
      return opening;
    },

    /** Переместить центр проёма (u — вдоль стены, y — высота центра). */
    move(hostId: string, id: string, target: { u: number; y: number }): void {
      change(hostId, id, (o, info, others) => moveOpening(o, target, info.host, others));
    },

    /** Изменить ширину и/или высоту. */
    resize(hostId: string, id: string, size: { width?: number; height?: number }): void {
      change(hostId, id, (o, info, others) => resizeOpening(o, size, info.host, others));
    },

    /** Отступ от пола (низ проёма). */
    setSill(hostId: string, id: string, sill: number): void {
      change(hostId, id, (o, info, others) => moveOpening(o, { u: o.position[0], y: sill + o.height / 2 }, info.host, others));
    },

    /** Положение центра вдоль стены. */
    setOffset(hostId: string, id: string, u: number): void {
      change(hostId, id, (o, info, others) => moveOpening(o, { u, y: o.position[1] }, info.host, others));
    },

    /** Превратить окно в дверь и наоборот (размеры — стандартные для типа). */
    setType(hostId: string, id: string, type: Opening['type']): void {
      change(hostId, id, (o, info, others) => {
        const defaults = OPENING_DEFAULTS[type];
        const converted = withSill({ ...o, type, height: defaults.height }, type === 'door' ? 0 : Math.max(defaults.sill, openingSill(o)));
        return resizeOpening(clampOpening(converted, info.host), {}, info.host, others);
      });
    },

    /** Удалить проём. */
    remove(hostId: string, id: string): void {
      const info = hostInfo(hostId);
      if (!info) return;
      if (info.partition) {
        ctx.dispatch(editorActions.removeOpeningFromPartition({ partitionId: hostId, openingId: id }));
      } else {
        ctx.dispatch(editorActions.removeOpening({ wallId: hostId, openingId: id }));
      }
    },

    /** Размеры стены (для полей ввода и 2D). */
    hostOf(hostId: string): OpeningHost | null {
      return hostInfo(hostId)?.host ?? null;
    },
  };
}
