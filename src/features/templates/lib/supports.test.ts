import { describe, expect, it } from 'vitest';
import { furnitureFootprint, itemSizes } from '@/features/editor-3d/lib/placement';
import { parseSceneDocument } from '@/features/editor-3d/lib/scene/parse';
import { pointInObb } from '@/shared/lib/math/geometry2d';
import type { FurnitureItem } from '@/features/furniture/types';
import { findBuiltinTemplate } from './builtins';

/** Мебель шаблона после загрузки (как при открытии проекта). */
function loaded(id: string): FurnitureItem[] {
  const result = parseSceneDocument(findBuiltinTemplate(id)!.build());
  if (!result.ok) throw new Error(result.error);
  return result.doc.floors[0].furniture as FurnitureItem[];
}

describe('templates: items on tables and nightstands', () => {
  it.each([
    ['bedroom', 'vase', 'nightstand-r'],
    ['kitchen', 'succulent', 'table'],
    ['office', 'lamp', 'desk'],
  ])('%s: «%s» stands on «%s» and moves with it', (template, itemId, supportId) => {
    const furniture = loaded(template);
    const item = furniture.find((f) => f.id === itemId)!;
    const support = furniture.find((f) => f.id === supportId)!;
    expect(item.supportId).toBe(supportId);
    expect(item.position[1]).toBeCloseTo(support.position[1] + itemSizes(support).height, 2);
    expect(pointInObb([item.position[0], item.position[2]], furnitureFootprint(support))).toBe(true);
  });

  it('does not attach floor furniture to anything', () => {
    const furniture = loaded('living');
    expect(furniture.filter((f) => f.supportId)).toEqual([]);
  });
});
