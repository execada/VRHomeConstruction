/**
 * Типы фичи настроек графики.
 * @module graphics/types
 */

/** Пресет качества; `custom` — пользователь изменил параметры вручную. */
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';

/** Допустимые размеры карты теней. */
export type ShadowMapSize = 512 | 1024 | 2048 | 4096;

/** Настройки графики (сохраняются в localStorage, не в проекте). */
export interface GraphicsSettings {
  preset: GraphicsPreset;
  /** Тени глобально */
  shadows: boolean;
  /** Размер карты теней, px */
  shadowMapSize: ShadowMapSize;
  /** Разрешение рендера относительно плотности пикселей экрана (0.5–1.5) */
  resolutionScale: number;
  /** Сглаживание (MSAA) */
  antialias: boolean;
  /** Счётчик FPS */
  showFps: boolean;
}
