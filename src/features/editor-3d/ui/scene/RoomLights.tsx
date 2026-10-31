/**
 * Свет комнаты: рассеянный (полусферный) + потолочные светильники.
 * Тени отбрасывает только первый светильник (прожектор вниз) — это даёт
 * реалистичную картинку без многократной стоимости кубических карт теней.
 * @module editor-3d/ui/scene/RoomLights
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Object3D, type Group } from 'three';
import { selectors as editorSelectors } from '../../selectors';
import { lampCandela, lampPositions, lightColor } from '../../lib/lamps';
import { useCutaway } from './cutaway';

interface RoomLightsProps {
  /** Тени глобально (настройки графики) */
  shadowsEnabled: boolean;
  shadowMapSize: number;
  /** Максимум светильников (меньше на слабых устройствах и в VR) */
  maxLamps: number;
  /** Скрывать плафоны вместе со срезанным потолком */
  cutaway: boolean;
}

const GROUND_COLOR = '#cbbba5';
const SKY_COLOR = '#fbf6ee';

/** Светильник: светящийся плафон под потолком. */
const Fixture: React.FC<{ position: [number, number, number]; color: string; on: boolean }> = ({ position, color, on }) => (
  <mesh position={[position[0], position[1] + 0.06, position[2]]} rotation={[Math.PI / 2, 0, 0]} userData={{ hideOnCut: true }}>
    <cylinderGeometry args={[0.16, 0.2, 0.05, 32]} />
    <meshStandardMaterial color="#f7f5f0" emissive={color} emissiveIntensity={on ? 2.2 : 0} roughness={0.4} />
  </mesh>
);

export const RoomLights: React.FC<RoomLightsProps> = memo(({ shadowsEnabled, shadowMapSize, maxLamps, cutaway }) => {
  const light = useSelector(editorSelectors.selectLightConfig);
  const dims = useSelector(editorSelectors.selectDimensions);
  const lamps = useMemo(() => lampPositions(dims, maxLamps), [dims, maxLamps]);
  const color = lightColor(light);
  const candela = lampCandela(light, lamps.length);
  const castShadow = light.enabled && light.shadows && shadowsEnabled;
  const target = useMemo(() => new Object3D(), []);
  const [first, ...rest] = lamps;
  const shouldCut = useMemo(
    () => (cutaway ? (camera: { position: { y: number } }) => camera.position.y > dims.height - 0.05 : null),
    [cutaway, dims.height],
  );
  const fixtures = useCutaway<Group>(shouldCut);

  return (
    <>
      <hemisphereLight args={[SKY_COLOR, GROUND_COLOR, 0.35 + light.ambientIntensity * 1.3]} />
      {light.enabled && (
        <>
          <primitive object={target} position={[first[0], 0, first[2]]} />
          <spotLight
            key={`spot_${shadowMapSize}`}
            position={first}
            target={target}
            color={color}
            intensity={candela * 1.6}
            angle={1.25}
            penumbra={0.85}
            decay={2}
            castShadow={castShadow}
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-bias={-0.0005}
            shadow-normalBias={0.03}
            shadow-camera-near={0.1}
            shadow-camera-far={dims.height * 2 + 4}
          />
          {rest.map((p) => (
            <pointLight key={p.join('_')} position={p} color={color} intensity={candela} decay={2} />
          ))}
        </>
      )}
      <group ref={fixtures}>
        {lamps.map((p) => (
          <Fixture key={`f_${p.join('_')}`} position={p} color={color} on={light.enabled} />
        ))}
      </group>
    </>
  );
});
