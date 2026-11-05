/**
 * Вид наружу по фотопанораме: резкий снимок 4k как бесконечно далёкий фон и настоящий
 * участок вокруг квартиры (см. lib/site): газон в цвет травы со снимка, вдали переходящий
 * в саму фотографию, или высотка над городом, уходящим в дымку цвета горизонта.
 * Снимок нигде не проецируется на землю, поэтому не растягивается ни сверху, ни сбоку.
 * @module editor-3d/ui/scene/site/PanoramaSite
 */

import React, { memo, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { PanoramaSite as PanoramaSiteSpec } from '@/features/assets';
import { LAWN_PHOTO_FADE, dimmedColor, fogRange, lawnTint, resolveSite } from '../../../lib/site';
import { GroundSite } from './GroundSite';
import { PanoramaBackdrop } from './PanoramaBackdrop';
import { TowerSite } from './TowerSite';
import { usePanoramaPreview } from './usePanoramaPreview';
import type { SitePhoto } from './useSiteMaterial';

const ANISOTROPY = 8;

function configureBackplate(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = ANISOTROPY;
  texture.needsUpdate = true;
  return texture;
}

interface PanoramaSiteProps {
  id: string;
  /** Снимок фона (equirect, LDR) */
  backplate: string;
  site?: PanoramaSiteSpec;
  /** Яркость снимка (экспозиция и время суток) */
  intensity: number;
  /** Поворот панорамы, рад */
  rotation: number;
  /** Дневной свет 0..1 */
  daylight: number;
}

export const PanoramaSite: React.FC<PanoramaSiteProps> = memo(({ id, backplate, site, intensity, rotation, daylight }) => {
  const loaded = useLoader(TextureLoader, backplate);
  const texture = useMemo(() => configureBackplate(loaded), [loaded]);
  const { colors, envMap } = usePanoramaPreview(texture, id);
  const spec = useMemo(() => resolveSite(site), [site]);
  const { near, far } = fogRange(spec.kind);
  const horizon = useMemo(() => dimmedColor(colors.horizon, intensity), [colors, intensity]);
  const lawn = useMemo(() => lawnTint(colors.ground), [colors]);
  const photo = useMemo<SitePhoto>(() => ({ texture, fade: LAWN_PHOTO_FADE, intensity, rotation }), [texture, intensity, rotation]);

  return (
    <>
      <color attach="background" args={[horizon]} />
      <PanoramaBackdrop texture={texture} intensity={intensity} rotation={rotation} />
      {spec.kind === 'elevated' ? (
        <>
          <fog attach="fog" args={[horizon, near, far]} />
          <TowerSite elevation={spec.elevation} envMap={envMap} rotation={rotation} daylight={daylight} />
        </>
      ) : (
        <GroundSite surface={spec.surface} tint={lawn} photo={photo} />
      )}
    </>
  );
});
