/**
 * Селекторы планировки: стыки стен и помещения (с названиями), вычисляемые по стенам.
 * @module editor-3d/layoutSelectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { cachedRooms, cachedWallLayout } from './lib/layoutCache';
import { nameRooms } from './lib/roomLabels';
import { selectors } from './selectors';

/** Стыки стен: участки внутренних стен и зоны примыканий. */
export const selectWallLayout = createSelector([selectors.selectDimensions, selectors.selectPartitions], cachedWallLayout);

/** Помещения с названиями и видами. */
export const selectRooms = createSelector(
  [selectors.selectDimensions, selectors.selectPartitions, selectors.selectRoomLabels],
  (dims, partitions, labels) => nameRooms(cachedRooms(dims, partitions), labels),
);
