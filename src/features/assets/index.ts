/**
 * Публичный API каталога ассетов.
 * @module assets
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const AssetsFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export type { AssetManifest, HdriEntry, PanoramaSite, TextureEntry, ModelEntry, ModelCategory } from './lib/manifest';
