/**
 * Селектор каталога мебели (модели из манифеста + процедурные + пользовательские).
 * @module furniture/model/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as assetSelectors } from '@/features/assets/selectors';
import { buildCatalog } from '../catalog';

/** Полный каталог мебели */
export const selectFurnitureCatalog = createSelector(assetSelectors.selectModelEntries, buildCatalog);
