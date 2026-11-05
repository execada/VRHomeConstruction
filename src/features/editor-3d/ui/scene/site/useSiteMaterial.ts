/**
 * PBR-материал покрытия участка (газон, плитка террасы) без видимых повторов текстуры.
 * Газон можно перекрасить в цвет травы со снимка и вдали перевести в саму фотографию
 * (см. lib/noTileShader и lib/sitePhotoFade). Карты загружаются через Suspense.
 * @module editor-3d/ui/scene/site/useSiteMaterial
 */

import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { noTileFragment } from '../../../lib/noTileShader';
import { LAWN_TINT_MIX, SITE_SURFACES, type SiteSurfaceId } from '../../../lib/site';
import { photoFadeFragment, photoFadeUniforms, photoFadeVertex } from '../../../lib/sitePhotoFade';

const ANISOTROPY = 8;
/** Средняя линейная яркость текстуры, если её не удалось посчитать. */
const FALLBACK_LUMA = 0.2;

/** Переход в фотографию: снимок, расстояния перехода, яркость и поворот как у фона. */
export interface SitePhoto {
  texture: Texture;
  fade: readonly [number, number];
  intensity: number;
  rotation: number;
}

function configure(texture: Texture, isColor: boolean): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = ANISOTROPY;
  texture.colorSpace = isColor ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Средняя линейная яркость карты цвета (по уменьшенной копии). */
function meanLuma(image: unknown): number {
  if (typeof document === 'undefined' || !image) return FALLBACK_LUMA;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return FALLBACK_LUMA;
  try {
    context.drawImage(image as CanvasImageSource, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    const color = new Color();
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      color.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, SRGBColorSpace);
      sum += 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    }
    return sum / (data.length / 4);
  } catch (error) {
    console.warn('Не удалось посчитать яркость текстуры участка', error);
    return FALLBACK_LUMA;
  }
}

/**
 * Материал покрытия участка.
 * @param surface - покрытие
 * @param tint - альбедо, в которое перекрасить текстуру (null — свой цвет)
 * @param photo - переход в фотографию вдали (null — без перехода)
 */
export function useSiteMaterial(surface: SiteSurfaceId, tint: Color | null = null, photo: SitePhoto | null = null): MeshStandardMaterial {
  const { maps } = SITE_SURFACES[surface];
  const [color, normal, roughness] = useLoader(TextureLoader, [maps.color, maps.normal, maps.roughness]);
  const photoTexture = photo?.texture ?? null;
  const [fadeNear, fadeFar] = photo?.fade ?? [0, 0];

  const uniforms = useMemo(
    () => ({ siteTint: { value: new Color(1, 1, 1) }, siteTintMix: { value: 0 }, siteMeanLuma: { value: meanLuma(color.image) } }),
    [color],
  );
  const photoUniforms = useMemo(
    () => (photoTexture ? photoFadeUniforms(photoTexture, [fadeNear, fadeFar]) : null),
    [photoTexture, fadeNear, fadeFar],
  );

  const material = useMemo(() => {
    const result = new MeshStandardMaterial({
      map: configure(color, true),
      normalMap: configure(normal, false),
      roughnessMap: configure(roughness, false),
      roughness: 1,
      metalness: 0,
    });
    result.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, photoUniforms);
      shader.fragmentShader = noTileFragment(shader.fragmentShader);
      if (photoUniforms) {
        shader.vertexShader = photoFadeVertex(shader.vertexShader);
        shader.fragmentShader = photoFadeFragment(shader.fragmentShader);
      }
    };
    result.customProgramCacheKey = () => (photoUniforms ? 'site-no-tile-photo' : 'site-no-tile');
    return result;
  }, [color, normal, roughness, uniforms, photoUniforms]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    uniforms.siteTintMix.value = tint ? LAWN_TINT_MIX : 0;
    if (tint) uniforms.siteTint.value.copy(tint);
  }, [uniforms, tint]);
  useEffect(() => {
    if (!photoUniforms || !photo) return;
    photoUniforms.sitePhotoIntensity.value = photo.intensity;
    photoUniforms.sitePhotoRotation.value = photo.rotation;
  }, [photoUniforms, photo]);

  return material;
}
