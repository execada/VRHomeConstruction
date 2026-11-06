/**
 * Какой этаж показать после отмены или повтора: если шаг истории меняет ровно один этаж
 * и это не активный этаж, активным становится он — правка не отменяется «невидимо»
 * на другом этаже. Иначе активный этаж остаётся прежним (или ближайшим, если его нет).
 * @module history/lib/floorFocus
 */

import type { FloorDocument, SceneDocument } from '@/features/editor-3d/lib/scene/schema';

const snapshot = (floor: FloorDocument) => JSON.stringify(floor);

/**
 * @param target - документ, к которому возвращаемся
 * @param current - текущий документ
 * @param activeId - активный этаж сейчас
 * @returns id этажа, который сделать активным
 */
export function floorToShow(target: SceneDocument, current: SceneDocument, activeId: string): string {
  const before = new Map(current.floors.map((f) => [f.id, snapshot(f)]));
  const changed = target.floors.filter((f) => before.get(f.id) !== snapshot(f)).map((f) => f.id);
  const activeKept = target.floors.some((f) => f.id === activeId);
  return activeKept && changed.length === 1 && changed[0] !== activeId ? changed[0] : activeId;
}
