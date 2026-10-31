/**
 * Селекторы каталога ассетов.
 * @module assets/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { EMPTY_MANIFEST } from './lib/manifest';
import { name, AssetsState } from './slice';

type State = {
  [name]: AssetsState;
};

const root = (state: State) => state[name];

/** Статус загрузки манифеста */
const selectAssetsStatus = createSelector(root, (state) => state?.status ?? 'idle');
/** Манифест */
const selectManifest = createSelector(root, (state) => state?.manifest ?? EMPTY_MANIFEST);
/** HDRI-пейзажи */
const selectHdris = createSelector(selectManifest, (m) => m.hdris);
/** PBR-текстуры */
const selectTextureEntries = createSelector(selectManifest, (m) => m.textures);
/** Модели */
const selectModelEntries = createSelector(selectManifest, (m) => m.models);

export const selectors = {
  selectAssetsStatus,
  selectManifest,
  selectHdris,
  selectTextureEntries,
  selectModelEntries,
};
