/**
 * Пресеты качества графики и вычисление параметров рендера.
 * @module graphics/lib/presets
 */

import type { GraphicsPreset, GraphicsSettings, ShadowMapSize } from '../types';

type PresetValues = Pick<GraphicsSettings, 'shadows' | 'shadowMapSize' | 'resolutionScale' | 'antialias'>;

/** Значения пресетов. */
export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, PresetValues> = {
  low: { shadows: false, shadowMapSize: 512, resolutionScale: 0.75, antialias: false },
  medium: { shadows: true, shadowMapSize: 1024, resolutionScale: 1, antialias: true },
  high: { shadows: true, shadowMapSize: 2048, resolutionScale: 1.25, antialias: true },
};

/** Подписи пресетов. */
export const PRESET_LABELS: Record<GraphicsPreset, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  custom: 'Своя',
};

/** Варианты размера карты теней. */
export const SHADOW_MAP_SIZES: readonly ShadowMapSize[] = [512, 1024, 2048, 4096];

/** Диапазон масштаба разрешения. */
export const RESOLUTION_SCALE_RANGE = [0.5, 1.5] as const;

/** Настройки по умолчанию (средний пресет). */
export const DEFAULT_GRAPHICS: GraphicsSettings = { preset: 'medium', ...GRAPHICS_PRESETS.medium, showFps: false };

/** Применить пресет (счётчик FPS не меняется). */
export function applyPreset(settings: GraphicsSettings, preset: Exclude<GraphicsPreset, 'custom'>): GraphicsSettings {
  return { ...settings, ...GRAPHICS_PRESETS[preset], preset };
}

/** Какой пресет соответствует значениям (или `custom`). */
export function detectPreset(values: PresetValues): GraphicsPreset {
  const match = (Object.keys(GRAPHICS_PRESETS) as Array<keyof typeof GRAPHICS_PRESETS>).find((key) => {
    const p = GRAPHICS_PRESETS[key];
    return (
      p.shadows === values.shadows &&
      p.shadowMapSize === values.shadowMapSize &&
      Math.abs(p.resolutionScale - values.resolutionScale) < 1e-6 &&
      p.antialias === values.antialias
    );
  });
  return match ?? 'custom';
}

/** Изменить отдельные параметры; пресет пересчитывается автоматически. */
export function withOverride(settings: GraphicsSettings, patch: Partial<Omit<GraphicsSettings, 'preset'>>): GraphicsSettings {
  const next = { ...settings, ...patch };
  return { ...next, preset: detectPreset(next) };
}

/**
 * Плотность пикселей для Canvas.
 * @param devicePixelRatio - плотность экрана
 * @param scale - масштаб разрешения из настроек
 */
export function computeDpr(devicePixelRatio: number, scale: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(2, Math.max(0.5, dpr * scale));
}
