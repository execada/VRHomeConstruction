/**
 * Ссылки на штриховки материалов стен плана (паттерны — в PlanHatches).
 * @module widgets/plan-editor-2d/lib/hatch
 */

import type { WallMaterialId } from '@/features/editor-3d/types';

/** id SVG-паттерна штриховки материала. */
export function hatchId(material: string): string {
  return `plan-hatch-${material}`;
}

/** Заливка стены штриховкой её материала. */
export function hatchFill(material: WallMaterialId): string {
  return `url(#${hatchId(material)})`;
}
