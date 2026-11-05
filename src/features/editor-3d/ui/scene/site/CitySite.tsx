/**
 * Город под высоткой: каменные и стеклянные здания двумя InstancedMesh (окна в мировых
 * координатах, у каждого здания свой рисунок вечерних огней), улицы и площадь вокруг башни.
 * Все крыши ниже квартиры, вдали кварталы уходят в дымку цвета горизонта (туман сцены),
 * а над горизонтом остаётся силуэт города со снимка. Не ловит указатель и не отбрасывает тени.
 * @module editor-3d/ui/scene/site/CitySite
 */

import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type InstancedMesh, type Texture } from 'three';
import { cityLayout, type CityBuilding } from '../../../lib/cityLayout';
import { cityFragment, cityVertex } from '../../../lib/cityShader';
import { FACADE_MODULE_METERS, type FacadeStyle } from '../../../lib/facade';
import { CITY_CLEAR, CITY_RADIUS, SITE_RADIUS } from '../../../lib/site';
import { NO_RAYCAST } from '../pointer';
import type { FacadeMaps } from './useFacadeMaps';

const STREET = '#4a4c4f';
const ROOF = '#a9abad';
/** Оттенки фасадов: светлый камень и бетон; голубоватое и серое стекло. */
const TONES: Record<FacadeStyle, readonly string[]> = {
  punched: ['#f4efe6', '#e2dccf', '#d3d5d6', '#ece2d0', '#c9cfd5'],
  curtain: ['#d5e2ee', '#bccbd9', '#e0e4e8'],
};
const SURFACE: Record<FacadeStyle, { metalness: number; roughness: number }> = {
  punched: { metalness: 0.05, roughness: 0.75 },
  curtain: { metalness: 0.6, roughness: 0.2 },
};
/** Яркость окон, горящих вечером (0 днём). */
const NIGHT_GLOW = 1.1;
/** Яркость стен ночью относительно дня: светятся окна, а не фасады. */
const NIGHT_WALLS = 0.3;

interface BlocksProps {
  buildings: CityBuilding[];
  style: FacadeStyle;
  elevation: number;
  maps: FacadeMaps;
  envMap: Texture | null;
  rotation: number;
  daylight: number;
}

/** Здания одного типа фасада. */
const Blocks: React.FC<BlocksProps> = ({ buildings, style, elevation, maps, envMap, rotation, daylight }) => {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const material = useMemo(() => {
    const result = new MeshStandardMaterial({ map: maps.color, emissiveMap: maps.lit, emissive: new Color('#ffffff'), envMap, ...SURFACE[style] });
    const roof = new Color(ROOF);
    result.onBeforeCompile = (shader) => {
      shader.uniforms.cityModule = { value: [FACADE_MODULE_METERS.width, FACADE_MODULE_METERS.height] };
      shader.uniforms.cityRoof = { value: roof };
      shader.vertexShader = cityVertex(shader.vertexShader);
      shader.fragmentShader = cityFragment(shader.fragmentShader);
    };
    result.customProgramCacheKey = () => 'city-facade';
    return result;
  }, [maps, envMap, style]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useEffect(() => {
    material.emissiveIntensity = (1 - daylight) * NIGHT_GLOW;
    material.color.setScalar(NIGHT_WALLS + (1 - NIGHT_WALLS) * daylight);
    material.envMapRotation.set(0, rotation, 0);
  }, [material, daylight, rotation]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const quaternion = new Quaternion();
    const color = new Color();
    const tones = TONES[style];
    buildings.forEach((b, i) => {
      mesh.setMatrixAt(i, matrix.compose(position.set(b.x, -elevation, b.z), quaternion, scale.set(b.width, b.height, b.depth)));
      mesh.setColorAt(i, color.set(tones[Math.min(tones.length - 1, Math.floor(b.tone * tones.length))]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buildings, elevation, style]);

  return <instancedMesh ref={ref} args={[geometry, material, buildings.length]} frustumCulled={false} raycast={NO_RAYCAST} />;
};

interface CitySiteProps {
  /** Высота пола квартиры над улицей, м */
  elevation: number;
  maps: Record<FacadeStyle, FacadeMaps>;
  envMap: Texture | null;
  rotation: number;
  daylight: number;
}

export const CitySite: React.FC<CitySiteProps> = memo(({ elevation, maps, envMap, rotation, daylight }) => {
  const groups = useMemo(() => {
    const city = cityLayout({ radius: CITY_RADIUS, clear: CITY_CLEAR, elevation });
    return { punched: city.filter((b) => !b.glass), curtain: city.filter((b) => b.glass) };
  }, [elevation]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -elevation, 0]} raycast={NO_RAYCAST}>
        <circleGeometry args={[SITE_RADIUS, 96]} />
        <meshStandardMaterial color={STREET} roughness={0.95} />
      </mesh>
      {(['punched', 'curtain'] as const).map((style) => (
        <Blocks
          key={style}
          buildings={groups[style]}
          style={style}
          elevation={elevation}
          maps={maps[style]}
          envMap={envMap}
          rotation={rotation}
          daylight={daylight}
        />
      ))}
    </group>
  );
});
