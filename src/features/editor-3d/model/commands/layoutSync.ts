/**
 * Согласование планировки после изменения стен: проёмы выходят из зон стыков
 * (или удаляются, если места на стене не осталось), подписи помещений переносятся
 * в свои помещения. Вызывается в конце жеста и после разовых правок стен.
 * @module editor-3d/model/commands/layoutSync
 */

import { cachedRooms, cachedWallLayout } from '../../lib/layoutCache';
import { normalizeWallOpenings, type OpeningHost } from '../../lib/openings';
import { reanchorRoomLabels } from '../../lib/roomLabels';
import type { WallLayout } from '../../lib/wallJoints';
import { wallFrame, WALL_SIDES } from '../../lib/walls';
import { actions as editorActions } from '../../slice';
import type { Opening, Partition, RoomDimensions, RoomLabel, WallSide } from '../../types';
import type { CommandContext } from './context';

/** Внешняя стена как основа проёмов (с зонами примыкания внутренних стен). */
export function outerWallHost(side: WallSide, dims: RoomDimensions, layout: WallLayout): OpeningHost {
  const frame = wallFrame(side, dims);
  return { length: frame.length, height: frame.height, blocked: layout.outer[side] };
}

/** Внутренняя стена как основа проёмов (с зонами стыков). */
export function interiorWallHost(partition: Partition, layout: WallLayout): OpeningHost {
  return { length: partition.size[0], height: partition.size[1], blocked: layout.interior[partition.id]?.blocked ?? [] };
}

const EPS = 1e-6;

/** Совпадают ли наборы проёмов (порядок не важен). */
function sameOpenings(a: readonly Opening[], b: readonly Opening[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o) => {
    const other = b.find((x) => x.id === o.id);
    return (
      other !== undefined &&
      Math.abs(other.position[0] - o.position[0]) < EPS &&
      Math.abs(other.position[1] - o.position[1]) < EPS &&
      Math.abs(other.width - o.width) < EPS &&
      Math.abs(other.height - o.height) < EPS
    );
  });
}

const sameLabels = (a: readonly RoomLabel[], b: readonly RoomLabel[]) =>
  a.length === b.length && a.every((l, i) => l.id === b[i].id && Math.abs(l.anchor[0] - b[i].anchor[0]) < EPS && Math.abs(l.anchor[1] - b[i].anchor[1]) < EPS);

/** Проёмы внутренних стен с учётом стыков. */
function fitInterior(partitions: Partition[], layout: WallLayout): Partition[] {
  return partitions.map((p) => {
    const next = normalizeWallOpenings(p.openings, interiorWallHost(p, layout));
    return sameOpenings(next, p.openings) ? p : { ...p, openings: next };
  });
}

/** Проёмы внешних стен с учётом примыканий; та же ссылка, если ничего не изменилось. */
function fitOuter(openings: { [wallId: string]: Opening[] }, dims: RoomDimensions, layout: WallLayout) {
  let changed = false;
  const next = { ...openings };
  for (const side of WALL_SIDES) {
    const list = openings[side];
    if (!list?.length) continue;
    const fitted = normalizeWallOpenings(list, outerWallHost(side, dims, layout));
    if (sameOpenings(fitted, list)) continue;
    changed = true;
    if (fitted.length) next[side] = fitted;
    else delete next[side];
  }
  return changed ? next : openings;
}

/** Согласовать проёмы и подписи помещений с текущими стенами. */
export function syncLayout(ctx: CommandContext): void {
  const { editor } = ctx.getState();
  const layout = cachedWallLayout(editor.dimensions, editor.partitions);
  const partitions = fitInterior(editor.partitions, layout);
  if (partitions.some((p, i) => p !== editor.partitions[i])) ctx.dispatch(editorActions.setPartitions(partitions));
  const openings = fitOuter(editor.openings, editor.dimensions, layout);
  if (openings !== editor.openings) ctx.dispatch(editorActions.setOpenings(openings));
  const after = ctx.getState().editor;
  const labels = reanchorRoomLabels(after.rooms, cachedRooms(after.dimensions, after.partitions));
  if (!sameLabels(labels, after.rooms)) ctx.dispatch(editorActions.setRooms(labels));
}
