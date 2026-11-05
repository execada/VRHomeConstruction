/**
 * Земля вокруг дома: газон (PBR, без повторов текстуры), принимает тени дома.
 * Под фотопанорамой газон перекрашен в цвет травы со снимка и вдали переходит в саму
 * фотографию — у края он совпадает с фоном, поэтому шва и «обрезанных» деревьев нет.
 * Без снимка газон тянется почти до горизонта и уходит в туман цвета неба.
 * Пока карты грузятся — ровный круг цвета травы.
 * @module editor-3d/ui/scene/site/GroundSite
 */

import React, { Suspense, memo, useEffect, useMemo } from 'react';
import type { Color } from 'three';
import { LAWN_PHOTO_RADIUS, SITE_RADIUS, SITE_SURFACES, type SiteSurfaceId } from '../../../lib/site';
import { tiledDisk } from '../../../lib/siteGeometry';
import { NO_RAYCAST } from '../pointer';
import { useSiteMaterial, type SitePhoto } from './useSiteMaterial';

/** Чуть ниже пола квартиры, чтобы не мерцать с ним. */
const GROUND_Y = -0.02;
const PLACEHOLDER = '#6f7d55';

interface GroundSiteProps {
  surface: SiteSurfaceId;
  /** Альбедо газона под цвет травы на снимке */
  tint?: Color | null;
  /** Переход в фотографию вдали */
  photo?: SitePhoto | null;
}

const TexturedGround: React.FC<GroundSiteProps> = ({ surface, tint = null, photo = null }) => {
  const material = useSiteMaterial(surface, tint, photo);
  const radius = photo ? LAWN_PHOTO_RADIUS : SITE_RADIUS;
  const geometry = useMemo(() => tiledDisk(radius, SITE_SURFACES[surface].tileMeters), [radius, surface]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow raycast={NO_RAYCAST} />;
};

const PlaceholderGround: React.FC<{ radius: number }> = ({ radius }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow raycast={NO_RAYCAST}>
    <circleGeometry args={[radius, 64]} />
    <meshStandardMaterial color={PLACEHOLDER} roughness={1} />
  </mesh>
);

export const GroundSite: React.FC<GroundSiteProps> = memo((props) => (
  <Suspense fallback={<PlaceholderGround radius={props.photo ? LAWN_PHOTO_RADIUS : SITE_RADIUS} />}>
    <TexturedGround {...props} />
  </Suspense>
));
