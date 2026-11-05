/**
 * Текстуры фасадов (цвет и маска вечерних окон): стеклянный — для башни и стеклянных
 * зданий города, каменный с окнами — для остальных кварталов.
 * @module editor-3d/ui/scene/site/useFacadeMaps
 */

import { useEffect, useMemo } from 'react';
import { DataTexture, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace } from 'three';
import { facadePixels, type FacadeStyle } from '../../../lib/facade';

export interface FacadeMaps {
  color: DataTexture;
  lit: DataTexture;
}

function facadeTexture(data: Uint8Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function facadeMaps(style: FacadeStyle): FacadeMaps {
  const pixels = facadePixels(512, 512, style === 'curtain' ? 7 : 19, style);
  return { color: facadeTexture(pixels.color, pixels.width, pixels.height), lit: facadeTexture(pixels.lit, pixels.width, pixels.height) };
}

/** Текстуры обоих фасадов (создаются один раз на монтирование и освобождаются после). */
export function useFacadeMaps(): Record<FacadeStyle, FacadeMaps> {
  const maps = useMemo(() => ({ curtain: facadeMaps('curtain'), punched: facadeMaps('punched') }), []);
  useEffect(
    () => () => {
      for (const set of Object.values(maps)) {
        set.color.dispose();
        set.lit.dispose();
      }
    },
    [maps],
  );
  return maps;
}
