/**
 * Слой мебели: все предметы сцены. Перерисовывается только изменённый предмет (memo).
 * @module editor-3d/ui/scene/FurnitureLayer
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { FurnitureNode } from './FurnitureNode';

export const FurnitureLayer: React.FC = () => {
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const selection = useSelector(selectionSelectors.selectSelection);
  const selectedId = selection?.kind === 'furniture' ? selection.id : null;
  return (
    <>
      {items.map((item) => (
        <FurnitureNode key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </>
  );
};
