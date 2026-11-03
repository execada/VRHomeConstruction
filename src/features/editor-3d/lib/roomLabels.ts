/**
 * Названия и виды помещений: сопоставление подписей с найденными помещениями,
 * имена по умолчанию, переименование, площадь квартиры с учётом лоджий и балконов,
 * перенос подписей после изменения стен.
 * @module editor-3d/lib/roomLabels
 */

import { length2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { roomAt, type DetectedRoom } from './rooms';
import type { RoomKind, RoomLabel } from '../types';

/** Виды помещений: подпись и коэффициент площади (СП 54.13330: лоджия 0,5, балкон 0,3). */
export const ROOM_KINDS: Record<RoomKind, { label: string; factor: number }> = {
  room: { label: 'Помещение', factor: 1 },
  loggia: { label: 'Лоджия', factor: 0.5 },
  balcony: { label: 'Балкон', factor: 0.3 },
};

/** Подсказки названий помещений. */
export const ROOM_NAME_PRESETS = [
  'Гостиная',
  'Кухня',
  'Кухня-гостиная',
  'Спальня',
  'Детская',
  'Кабинет',
  'Прихожая',
  'Коридор',
  'Санузел',
  'Ванная',
  'Гардеробная',
  'Кладовая',
  'Лоджия',
  'Балкон',
] as const;

/** Максимальная длина названия помещения. */
export const ROOM_NAME_MAX = 60;

/** Помещение с названием и видом. */
export interface Room extends DetectedRoom {
  /** Ключ для списков: id подписи или порядковый */
  key: string;
  labelId: string | null;
  name: string;
  kind: RoomKind;
}

/** Подпись, принадлежащая помещению (первая по порядку). */
function labelOf(room: DetectedRoom, labels: readonly RoomLabel[]): RoomLabel | null {
  return labels.find((l) => roomAt([room], l.anchor) === room) ?? null;
}

/**
 * Помещения с названиями: подписи находят свои помещения по точке, остальные
 * получают имена «Комната 1», «Комната 2»… (единственное — просто «Комната»).
 */
export function nameRooms(rooms: readonly DetectedRoom[], labels: readonly RoomLabel[]): Room[] {
  let unnamed = 0;
  return rooms.map((room, index) => {
    const label = labelOf(room, labels);
    if (label) return { ...room, key: label.id, labelId: label.id, name: label.name, kind: label.kind ?? 'room' };
    unnamed += 1;
    const name = rooms.length === 1 ? 'Комната' : `Комната ${unnamed}`;
    return { ...room, key: `auto-${index}`, labelId: null, name, kind: 'room' };
  });
}

/** Общая площадь квартиры: лоджии и балконы — с понижающими коэффициентами. */
export function totalArea(rooms: readonly Pick<Room, 'area' | 'kind'>[]): number {
  return rooms.reduce((sum, r) => sum + r.area * ROOM_KINDS[r.kind].factor, 0);
}

/**
 * Переименовать помещение или сменить его вид (создаёт подпись, если её не было).
 * @param labels - текущие подписи
 * @param room - помещение
 * @param patch - новое название и/или вид
 * @param newId - id для новой подписи
 */
export function upsertRoomLabel(
  labels: readonly RoomLabel[],
  room: Pick<Room, 'labelId' | 'name' | 'kind' | 'center'>,
  patch: { name?: string; kind?: RoomKind },
  newId: string,
): RoomLabel[] {
  const name = (patch.name ?? room.name).trim().slice(0, ROOM_NAME_MAX) || room.name;
  const kind = patch.kind ?? room.kind;
  if (room.labelId) return labels.map((l) => (l.id === room.labelId ? { ...l, name, kind } : l));
  return [...labels, { id: newId, name, kind, anchor: [room.center[0], room.center[1]] }];
}

const toAnchor = (p: Vec2): [number, number] => [p[0], p[1]];

/**
 * Перенести подписи после изменения стен: подпись помещения встаёт в его центр,
 * подпись, оказавшаяся вне помещений (в толще стены), — в ближайшее помещение без подписи.
 */
export function reanchorRoomLabels(labels: readonly RoomLabel[], rooms: readonly DetectedRoom[]): RoomLabel[] {
  if (rooms.length === 0) return [...labels];
  const owners = new Map(rooms.map((r) => [r, labelOf(r, labels)] as const));
  const free = rooms.filter((r) => owners.get(r) === null);
  return labels.map((label) => {
    const room = roomAt(rooms, label.anchor);
    if (room) return owners.get(room) === label ? { ...label, anchor: toAnchor(room.center) } : label;
    const pool = free.length > 0 ? free : [...rooms];
    const nearest = pool.reduce((best, r) => (length2(sub2(r.center, label.anchor)) < length2(sub2(best.center, label.anchor)) ? r : best));
    free.splice(free.indexOf(nearest), free.includes(nearest) ? 1 : 0);
    return { ...label, anchor: toAnchor(nearest.center) };
  });
}
