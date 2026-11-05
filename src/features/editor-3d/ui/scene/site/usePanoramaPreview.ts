/**
 * Уменьшенная копия панорамы (512×256) на canvas: из неё берутся цвета дымки у горизонта
 * и ниже него, и она же служит картой отражений для стекла высотки — размытым отражениям
 * хватает малой копии, а 4k-снимок дал бы PMREM на сотню мегабайт видеопамяти.
 * @module editor-3d/ui/scene/site/usePanoramaPreview
 */

import { useEffect, useMemo } from 'react';
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace, type Texture } from 'three';
import { DEFAULT_HORIZON, horizonColors, type HorizonColors } from '../../../lib/site';

const WIDTH = 512;
const HEIGHT = 256;

export interface PanoramaPreview {
  colors: HorizonColors;
  /** Карта отражений (null, если canvas недоступен — тогда стекло отражает общее окружение) */
  envMap: Texture | null;
}

function buildPreview(image: unknown, label: string): PanoramaPreview {
  const fallback: PanoramaPreview = { colors: DEFAULT_HORIZON, envMap: null };
  if (typeof document === 'undefined' || !image) return fallback;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return fallback;
  try {
    context.drawImage(image as CanvasImageSource, 0, 0, WIDTH, HEIGHT);
    const colors = horizonColors(context.getImageData(0, 0, WIDTH, HEIGHT).data, WIDTH, HEIGHT);
    const envMap = new CanvasTexture(canvas);
    envMap.mapping = EquirectangularReflectionMapping;
    envMap.colorSpace = SRGBColorSpace;
    return { colors, envMap };
  } catch (error) {
    console.warn(`Панорама ${label}: не удалось построить уменьшенную копию, дымка нейтральная`, error);
    return fallback;
  }
}

/** Цвета дымки и карта отражений для загруженной панорамы (один раз на текстуру). */
export function usePanoramaPreview(texture: Texture, label: string): PanoramaPreview {
  const preview = useMemo(() => buildPreview(texture.image, label), [texture, label]);
  useEffect(() => () => preview.envMap?.dispose(), [preview]);
  return preview;
}
