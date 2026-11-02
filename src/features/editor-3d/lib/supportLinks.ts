/**
 * Связи «предмет — опора» (FurnitureItem.supportId): перенос предметов вместе с опорой,
 * починка связей из недоверенных документов и восстановление связей для предметов,
 * которые уже стоят на опорах (старые проекты и шаблоны, где лампу поднимали на высоту стола).
 * Опоры сами на опорах не стоят: глубина стопки — один уровень.
 * @module editor-3d/lib/supportLinks
 */

import { add2, normalizeAngle, pointInObb, rotateLocal, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import type { PlacementRole } from '@/features/furniture/lib/placementRole';
import type { FurnitureItem } from '@/features/furniture/types';
import { furnitureFootprint, itemSizes } from './placement';
import { furnitureRole } from './supportRole';

/** Предмет считается стоящим на опоре, если его низ не дальше этого от её верха, м. */
const REST_TOLERANCE = 0.02;
/** Ниже этой высоты предмет стоит на полу. */
const MIN_RAISE = 0.01;

const xz = (item: FurnitureItem): Vec2 => [item.position[0], item.position[2]];
const scaleOf = (item: FurnitureItem) => (item.scale > 0 ? item.scale : 1);

/** Предмет без связи с опорой. */
export function withoutSupport(item: FurnitureItem): FurnitureItem {
  const { supportId: _support, ...rest } = item;
  return rest;
}

/** Предметы на поверхности опоры. */
export function itemsOn(items: readonly FurnitureItem[], supportId: string): FurnitureItem[] {
  return items.filter((i) => i.supportId === supportId);
}

/** Уровень в стопке: 0 — на полу или на стене, 1 — на поверхности опоры. */
export function stackLevel(item: FurnitureItem): number {
  return item.supportId ? 1 : 0;
}

const poseChanged = (a: FurnitureItem, b: FurnitureItem) =>
  a.position.some((v, i) => v !== b.position[i]) || a.rotation[1] !== b.rotation[1] || scaleOf(a) !== scaleOf(b);

/**
 * Перенести предмет вместе с опорой: тот же сдвиг, поворот вокруг центра опоры,
 * та же разница высоты; при изменении масштаба опоры смещение и высота масштабируются.
 * @param child - предмет на опоре (до изменения опоры)
 * @param before - опора до изменения
 * @param after - опора после изменения
 */
export function carryWith(child: FurnitureItem, before: FurnitureItem, after: FurnitureItem): FurnitureItem {
  const ratio = scaleOf(after) / scaleOf(before);
  const turn = after.rotation[1] - before.rotation[1];
  const center = add2(xz(after), scale2(rotateLocal(sub2(xz(child), xz(before)), turn), ratio));
  const y = after.position[1] + (child.position[1] - before.position[1]) * ratio;
  return {
    ...child,
    position: [center[0], y, center[1]],
    rotation: [child.rotation[0], turn === 0 ? child.rotation[1] : normalizeAngle(child.rotation[1] + turn), child.rotation[2]],
  };
}

/**
 * Перенести предметы на опорах, которые изменились между двумя состояниями сцены.
 * @param before - мебель до изменения
 * @param after - мебель после изменения (позиции предметов на опорах заменяются перенесёнными)
 */
export function carrySupported(before: readonly FurnitureItem[], after: readonly FurnitureItem[]): FurnitureItem[] {
  const was = new Map(before.map((i) => [i.id, i] as const));
  const now = new Map(after.map((i) => [i.id, i] as const));
  return after.map((item) => {
    const supportBefore = item.supportId ? was.get(item.supportId) : undefined;
    const supportAfter = item.supportId ? now.get(item.supportId) : undefined;
    const childBefore = was.get(item.id);
    if (!supportBefore || !supportAfter || !childBefore || !poseChanged(supportBefore, supportAfter)) return item;
    return carryWith(childBefore, supportBefore, supportAfter);
  });
}

/**
 * Починить связи из недоверенного документа: опоры нет — предмет ставится на пол;
 * ссылка на себя или на предмет, который сам стоит на опоре, — связь снимается.
 */
export function repairSupportLinks(items: readonly FurnitureItem[]): FurnitureItem[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  return items.map((item) => {
    if (!item.supportId) return item;
    const support = byId.get(item.supportId);
    if (!support) return { ...withoutSupport(item), position: [item.position[0], 0, item.position[2]] };
    return support.id === item.id || support.supportId ? withoutSupport(item) : item;
  });
}

/** Опора, на верхе которой уже стоит предмет (по габариту), или null. */
function restingOn(item: FurnitureItem, supports: readonly FurnitureItem[]): FurnitureItem | null {
  const point = xz(item);
  const candidates = supports
    .filter((s) => s.id !== item.id && pointInObb(point, furnitureFootprint(s)))
    .map((support) => ({ support, gap: Math.abs(support.position[1] + itemSizes(support).height - item.position[1]) }))
    .filter((c) => c.gap <= REST_TOLERANCE)
    .sort((a, b) => a.gap - b.gap);
  return candidates[0]?.support ?? null;
}

/**
 * Восстановить связи для предметов, которые уже стоят на верхе опоры (низ на её высоте,
 * центр над ней): так старые проекты и шаблоны получают переносимые вместе с опорой предметы.
 * @param items - мебель
 * @param roleOf - роль предмета (по умолчанию — по названию, пути и габаритам модели)
 */
export function inferSupportLinks(
  items: readonly FurnitureItem[],
  roleOf: (item: FurnitureItem) => PlacementRole = furnitureRole,
): FurnitureItem[] {
  const supports = items.filter((i) => !i.supportId && roleOf(i) === 'support');
  return items.map((item) => {
    if (item.supportId || item.position[1] < MIN_RAISE || roleOf(item) !== 'surface') return item;
    const support = restingOn(item, supports);
    return support ? { ...item, supportId: support.id } : item;
  });
}

/** Связи документа после загрузки: починить недопустимые и восстановить очевидные. */
export function normalizeSupportLinks(items: readonly FurnitureItem[]): FurnitureItem[] {
  return inferSupportLinks(repairSupportLinks(items));
}
