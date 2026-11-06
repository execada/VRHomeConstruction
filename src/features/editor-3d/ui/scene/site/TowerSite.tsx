/**
 * Высотка под зданием для городских панорам: терраса на крыше (ровно участок вокруг всех этажей,
 * по которому можно ходить от первого лица) с плиткой и стеклянным ограждением, стеклянный фасад башни
 * с отражением города и вечерними огнями, а внизу — город (см. CitySite). Он закрывает низ
 * снимка (крышу, с которой его снимали), и вид из окна смотрит на кварталы под башней.
 * @module editor-3d/ui/scene/site/TowerSite
 */

import React, { Suspense, memo, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Color, MeshStandardMaterial, type Texture } from 'three';
import { buildingSelectors } from '../../../building/selectors';
import { FACADE_MODULE_METERS } from '../../../lib/facade';
import { SITE_SURFACES, terraceBox } from '../../../lib/site';
import { tiledPlane } from '../../../lib/siteGeometry';
import { NO_RAYCAST } from '../pointer';
import { CitySite } from './CitySite';
import { useFacadeMaps, type FacadeMaps } from './useFacadeMaps';
import { useSiteMaterial } from './useSiteMaterial';

const TERRACE_Y = -0.02;
const SLAB = 0.45;
const CURB = 0.12;
const RAIL_HEIGHT = 1.1;
const RAIL_INSET = 0.1;
const CONCRETE = '#c9c4bb';
/** Яркость окон, горящих вечером (0 днём). */
const NIGHT_GLOW = 1.3;

type Box = ReturnType<typeof terraceBox>;

const TerraceFloor: React.FC<{ box: Box }> = ({ box }) => {
  const material = useSiteMaterial('terrace');
  const geometry = useMemo(() => tiledPlane(box.width, box.depth, SITE_SURFACES.terrace.tileMeters), [box.width, box.depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[box.center[0], TERRACE_Y, box.center[1]]} receiveShadow raycast={NO_RAYCAST} />
  );
};

/** Стеклянное ограждение по краю террасы: бортик, стекло и поручень на каждой стороне. */
const Railing: React.FC<{ box: Box; envMap: Texture | null; rotation: number }> = ({ box, envMap, rotation }) => {
  const sides = useMemo(() => {
    const [cx, cz] = box.center;
    const hw = box.width / 2 - RAIL_INSET;
    const hd = box.depth / 2 - RAIL_INSET;
    return [
      { key: 'front', position: [cx, cz + hd], length: hw * 2, rotation: 0 },
      { key: 'back', position: [cx, cz - hd], length: hw * 2, rotation: 0 },
      { key: 'left', position: [cx - hw, cz], length: hd * 2, rotation: Math.PI / 2 },
      { key: 'right', position: [cx + hw, cz], length: hd * 2, rotation: Math.PI / 2 },
    ] as const;
  }, [box]);
  const glassY = TERRACE_Y + CURB + RAIL_HEIGHT / 2;
  return (
    <group>
      {sides.map((s) => (
        <group key={s.key} position={[s.position[0], 0, s.position[1]]} rotation={[0, s.rotation, 0]}>
          <mesh position={[0, TERRACE_Y + CURB / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, CURB, 0.16]} />
            <meshStandardMaterial color={CONCRETE} roughness={0.9} />
          </mesh>
          <mesh position={[0, glassY, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, RAIL_HEIGHT, 0.02]} />
            <meshStandardMaterial
              color="#d3e3ea"
              transparent
              opacity={0.2}
              roughness={0.04}
              metalness={0.2}
              envMap={envMap}
              envMapRotation={[0, rotation, 0]}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, glassY + RAIL_HEIGHT / 2 + 0.025, 0]} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, 0.05, 0.06]} />
            <meshStandardMaterial color="#b9bfc6" metalness={0.85} roughness={0.3} envMap={envMap} envMapRotation={[0, rotation, 0]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Тело башни: перекрытие крыши и четыре стеклянных фасада до самого низа. */
interface TowerBodyProps {
  box: Box;
  elevation: number;
  maps: FacadeMaps;
  envMap: Texture | null;
  rotation: number;
  daylight: number;
}

const TowerBody: React.FC<TowerBodyProps> = ({ box, elevation, maps, envMap, rotation, daylight }) => {
  const height = elevation - SLAB;
  const centerY = TERRACE_Y - SLAB - height / 2;
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: maps.color,
        emissiveMap: maps.lit,
        emissive: new Color('#ffffff'),
        metalness: 0.85,
        roughness: 0.14,
        envMap,
      }),
    [maps, envMap],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.emissiveIntensity = (1 - daylight) * NIGHT_GLOW;
  }, [material, daylight]);
  useEffect(() => {
    material.envMapRotation.set(0, rotation, 0);
  }, [material, rotation]);

  const faces = useMemo(() => {
    const [cx, cz] = box.center;
    const { width: mw, height: mh } = FACADE_MODULE_METERS;
    return [
      { key: 'front', geometry: tiledPlane(box.width, height, mw, mh), position: [cx, centerY, cz + box.depth / 2], rotation: 0 },
      { key: 'back', geometry: tiledPlane(box.width, height, mw, mh), position: [cx, centerY, cz - box.depth / 2], rotation: Math.PI },
      { key: 'right', geometry: tiledPlane(box.depth, height, mw, mh), position: [cx + box.width / 2, centerY, cz], rotation: Math.PI / 2 },
      { key: 'left', geometry: tiledPlane(box.depth, height, mw, mh), position: [cx - box.width / 2, centerY, cz], rotation: -Math.PI / 2 },
    ] as const;
  }, [box, height, centerY]);
  useEffect(() => () => faces.forEach((f) => f.geometry.dispose()), [faces]);

  return (
    <group>
      <mesh position={[box.center[0], TERRACE_Y - SLAB / 2, box.center[1]]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[box.width + 0.04, SLAB, box.depth + 0.04]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.85} />
      </mesh>
      {faces.map((f) => (
        <mesh key={f.key} geometry={f.geometry} material={material} position={[...f.position]} rotation={[0, f.rotation, 0]} raycast={NO_RAYCAST} />
      ))}
    </group>
  );
};

interface TowerSiteProps {
  /** Высота пола квартиры над городом, м */
  elevation: number;
  /** Панорама для отражений в стекле (null — общее окружение сцены) */
  envMap: Texture | null;
  /** Поворот панорамы, рад (отражения поворачиваются вместе с фоном) */
  rotation: number;
  /** Дневной свет 0..1 (ночью в окнах башни и города горит свет) */
  daylight: number;
}

export const TowerSite: React.FC<TowerSiteProps> = memo(({ elevation, envMap, rotation, daylight }) => {
  const lot = useSelector(buildingSelectors.selectBuildingLot);
  const box = useMemo(() => terraceBox(lot), [lot]);
  const maps = useFacadeMaps();
  return (
    <group>
      <Suspense fallback={null}>
        <TerraceFloor box={box} />
      </Suspense>
      <Railing box={box} envMap={envMap} rotation={rotation} />
      <TowerBody box={box} elevation={elevation} maps={maps.curtain} envMap={envMap} rotation={rotation} daylight={daylight} />
      <CitySite elevation={elevation} maps={maps} envMap={envMap} rotation={rotation} daylight={daylight} />
    </group>
  );
});
