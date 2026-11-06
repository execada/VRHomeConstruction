/**
 * Неподвижные препятствия активного этажа для мебели и лестниц: лестницы этажа
 * и вырезы в полу над лестницами этажа ниже.
 * @module editor-3d/model/commands/fixtures
 */

import { buildingSelectors } from '../../building/selectors';
import { floorRise } from '../../lib/building/floors';
import type { PlacementObstacle } from '../../lib/placement';
import { floorFixtures } from '../../lib/stairs/stairPlacement';
import type { SceneRootState } from './context';

/**
 * Препятствия этажа, которые не двигаются вместе с мебелью.
 * @param state - состояние сцены
 * @param excludeStairId - лестница, которую сейчас двигают
 */
export function fixtureObstacles(state: SceneRootState, excludeStairId?: string): PlacementObstacle[] {
  const { dimensions, stairs } = state.editor;
  const rise = floorRise(dimensions, state.building.slabThickness);
  return floorFixtures(stairs ?? [], rise, buildingSelectors.selectCutoutsFromBelow(state), dimensions.height, excludeStairId);
}
