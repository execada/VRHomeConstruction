/**
 * Типы фичи темы оформления.
 * @module theme/types
 */

/** Режим темы: светлая, тёмная или как в системе. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Состояние темы (Redux slice, сохраняется в localStorage). */
export interface ThemeState {
  mode: ThemeMode;
}
