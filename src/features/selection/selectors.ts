/**
 * Селекторы выделения: текущее выделение и «живые» данные выделенного объекта.
 * @module selection/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { name, SelectionState } from './slice';

type State = {
  [name]: SelectionState;
};

const root = (state: State) => state[name];

/** Текущее выделение */
const selectSelection = createSelector(root, (state) => state?.current ?? null);
/** Объект под курсором */
const selectHoveredId = createSelector(root, (state) => state?.hoveredId ?? null);

/** Выделенный предмет мебели (актуальные данные) */
const selectSelectedItem = createSelector([selectSelection, furnitureSelectors.selectFurnitureItems], (sel, items) =>
  sel?.kind === 'furniture' ? items.find((i) => i.id === sel.id) ?? null : null,
);

/** Выделенная перегородка (актуальные данные) */
const selectSelectedPartitionLive = createSelector([selectSelection, editorSelectors.selectPartitions], (sel, partitions) =>
  sel?.kind === 'partition' ? partitions.find((p) => p.id === sel.id) ?? null : null,
);

/** Выделенный проём (актуальные данные) и его стена/перегородка */
const selectSelectedOpeningLive = createSelector(
  [selectSelection, editorSelectors.selectOpenings, editorSelectors.selectPartitions],
  (sel, openings, partitions) => {
    if (sel?.kind !== 'opening') return null;
    const onWall = openings[sel.hostId]?.find((o) => o.id === sel.id);
    if (onWall) return { hostId: sel.hostId, opening: onWall, isPartition: false };
    const host = partitions.find((p) => p.id === sel.hostId);
    const onPartition = host?.openings.find((o) => o.id === sel.id);
    return onPartition ? { hostId: sel.hostId, opening: onPartition, isPartition: true } : null;
  },
);

/** id выделенного объекта (для подсветки в 2D/3D) */
const selectSelectedId = createSelector(selectSelection, (sel) => {
  if (!sel) return null;
  if (sel.kind === 'furniture' || sel.kind === 'partition' || sel.kind === 'opening') return sel.id;
  if (sel.kind === 'wall') return sel.side;
  return sel.kind;
});

export const selectors = {
  selectSelection,
  selectHoveredId,
  selectSelectedItem,
  selectSelectedPartitionLive,
  selectSelectedOpeningLive,
  selectSelectedId,
};
