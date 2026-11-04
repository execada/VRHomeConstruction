/**
 * Команды проёмов: создать окно/дверь, перемещать вдоль стены, менять ширину, высоту,
 * отступ от пола и тип, удалять; установить, снять, открыть и закрыть дверь.
 * Работают одинаково для внешних стен и перегородок.
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
import { DEFAULT_DOOR, normalizeDoor, type DoorSpec } from '../../lib/doors';
import { cachedWallLayout } from '../../lib/layoutCache';
import { isWallSide } from '../../lib/walls';
import type { Opening, Partition } from '../../types';
import { createId, type CommandContext } from './context';
import { interiorWallHost, outerWallHost } from './layoutSync';

/** Стена или перегородка с её проёмами. */
interface HostInfo {
  host: OpeningHost;
  list: Opening[];
  partition: Partition | null;
}

const OPENING_LABEL: Record<Opening['type'], string> = { window: 'окна', door: 'двери' };

/** Создать команды проёмов. */
export function createOpeningCommands(ctx: CommandContext) {
  /** Найти стену/перегородку по id (с зонами стыков, куда проёмы не заходят). */
  function hostInfo(hostId: string): HostInfo | null {
    const { editor } = ctx.getState();
    const layout = cachedWallLayout(editor.dimensions, editor.partitions);
    if (isWallSide(hostId)) {
      if (editor.removedWalls.includes(hostId)) return null;
      return { host: outerWallHost(hostId, editor.dimensions, layout), list: editor.openings[hostId] ?? [], partition: null };
    }
    const partition = editor.partitions.find((p) => p.id === hostId);
    return partition ? { host: interiorWallHost(partition, layout), list: partition.openings, partition } : null;
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
      const created = createOpening({ id: createId(type), type, wallId: hostId, host: info.host, others: info.list, preferredU });
      if (!created) {
        ctx.notify(`На этой стене нет места для ${OPENING_LABEL[type]}`);
        return null;
      }
      const opening: Opening = type === 'door' ? { ...created, door: DEFAULT_DOOR } : created;
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

    /** Превратить окно в дверь (с дверью по умолчанию) и наоборот (размеры — стандартные для типа). */
    setType(hostId: string, id: string, type: Opening['type']): void {
      change(hostId, id, (o, info, others) => {
        const defaults = OPENING_DEFAULTS[type];
        const { door: _door, ...rest } = o;
        const base: Opening = type === 'door' ? { ...rest, type, door: DEFAULT_DOOR } : { ...rest, type };
        const converted = withSill({ ...base, height: defaults.height }, type === 'door' ? 0 : Math.max(defaults.sill, openingSill(o)));
        return resizeOpening(clampOpening(converted, info.host), {}, info.host, others);
      });
    },

    /**
     * Установить или изменить дверь в дверном проёме (null — снять полотно, оставить пустой проём).
     * @param hostId - стена или перегородка
     * @param id - проём
     * @param patch - модель, петли, сторона открывания, открыта ли, цвет
     */
    setDoor(hostId: string, id: string, patch: Partial<DoorSpec> | null): void {
      change(hostId, id, (o) => {
        if (o.type !== 'door') return o;
        if (patch === null) {
          const { door: _door, ...rest } = o;
          return rest;
        }
        return { ...o, door: normalizeDoor(patch, o.door ?? DEFAULT_DOOR) };
      });
    },

    /** Открыть или закрыть дверь (если она установлена). */
    toggleDoor(hostId: string, id: string): void {
      change(hostId, id, (o) => (o.door ? { ...o, door: { ...o.door, open: !o.door.open } } : o));
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
