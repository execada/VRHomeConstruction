/**
 * Селектор каталога текстур (PBR из манифеста + процедурные).
 * @module textures/model/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as assetSelectors } from '@/features/assets/selectors';
import { buildTextureCatalog } from '../lib/catalog';

/** Полный каталог текстур */
export const selectTextureCatalog = createSelector(assetSelectors.selectTextureEntries, buildTextureCatalog);
