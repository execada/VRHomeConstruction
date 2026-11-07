/**
 * Селекторы подсказок.
 * @module hints/selectors
 */

import type { HintsState } from './types';

type State = { hints: HintsState };

export const selectors = {
  selectHintsEnabled: (state: State) => state.hints.enabled,
  selectDismissedHints: (state: State) => state.hints.dismissed,
  selectTourStep: (state: State) => state.hints.tourStep,
  selectTourDone: (state: State) => state.hints.tourDone,
};
