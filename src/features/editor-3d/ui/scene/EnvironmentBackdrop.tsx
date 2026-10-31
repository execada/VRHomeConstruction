/**
 * Вид из окна: HDRI-пейзаж с проекцией земли (реалистичный вид наружу),
 * процедурное небо, синхронное с солнцем, или сплошной цвет неба. Ночью фон плавно гаснет.
 * При ошибке загрузки HDRI — процедурное небо. Отражения и рассеянный свет интерьера —
 * отдельное «комнатное» окружение (InteriorEnvironment), а не уличное небо.
 * @module editor-3d/ui/scene/EnvironmentBackdrop
 */

import React, { Suspense, memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Environment, Sky } from '@react-three/drei';
import { selectors as assetSelectors } from '@/features/assets/selectors';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { mixHex } from '@/shared/lib/color/colorTemperature';
import { ErrorBoundary } from '@/shared/ui/error-boundary/ErrorBoundary';
import { sunState } from '../../lib/sun';
import { InteriorEnvironment, type EnvSceneProps } from './InteriorEnvironment';

const NIGHT_SKY = '#0d1626';
const GROUND = '#7e8b62';
const DEG = Math.PI / 180;

/** Земля вокруг дома (для режимов без HDRI). */
const ExteriorGround: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
    <circleGeometry args={[400, 48]} />
    <meshStandardMaterial color={GROUND} roughness={1} />
  </mesh>
);

/** Процедурное небо, синхронное с солнцем (только фон). */
const ProceduralSky: React.FC<{ direction: [number, number, number]; daylight: number }> = ({ direction, daylight }) => {
  const sunPosition = useMemo(() => direction.map((v) => v * 1000) as [number, number, number], [direction]);
  return (
    <>
      <Sky sunPosition={sunPosition} turbidity={6} rayleigh={0.6 + daylight * 1.4} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <ExteriorGround />
    </>
  );
};

/** Сплошной цвет неба (с учётом времени суток). */
const ColorSky: React.FC<{ color: string; daylight: number }> = ({ color, daylight }) => (
  <>
    <color attach="background" args={[mixHex(NIGHT_SKY, color, daylight)]} />
    <ExteriorGround />
  </>
);

/** HDRI-пейзаж с проекцией земли — только фон (вид из окна); отражения даёт InteriorEnvironment. */
const HdriBackdrop: React.FC<{ file: string; sceneProps: EnvSceneProps; fallback: React.ReactNode; id: string }> = ({ file, sceneProps, fallback, id }) => (
  <ErrorBoundary fallback={fallback} context={`HDRI ${id}`} resetKey={id}>
    <Suspense fallback={fallback}>
      <Environment files={file} background="only" ground={{ height: 1.7, radius: 90, scale: 180 }} {...sceneProps} />
    </Suspense>
  </ErrorBoundary>
);

/** Горизонтальное направление на солнце (для окна в отражениях), округлённое — чтобы не перерисовывать окружение на каждый шаг ползунка. */
function windowDirection([x, , z]: [number, number, number]): [number, number] {
  const length = Math.hypot(x, z) || 1;
  return [Math.round((x / length) * 20) / 20, Math.round((z / length) * 20) / 20];
}

export const EnvironmentBackdrop: React.FC = memo(() => {
  const sky = useSelector(environmentSelectors.selectSky);
  const sun = useSelector(environmentSelectors.selectSun);
  const hdris = useSelector(assetSelectors.selectHdris);
  const state = useMemo(() => sunState(sun.timeOfDay, sun.side), [sun.timeOfDay, sun.side]);
  const daylight = Math.round(state.daylight * 20) / 20;
  const [wx, wz] = windowDirection(state.direction);

  const exposure = sky.mode === 'hdri' ? sky.exposure : 1;
  const sceneProps = useMemo<EnvSceneProps>(
    () => ({
      backgroundIntensity: exposure * (0.06 + 0.94 * daylight),
      backgroundRotation: [0, sky.rotation * DEG, 0],
      environmentIntensity: 0.45 + 0.3 * daylight,
      environmentRotation: [0, 0, 0],
    }),
    [exposure, daylight, sky.rotation],
  );
  const windowDir = useMemo<[number, number]>(() => [wx, wz], [wx, wz]);

  const hdri = sky.mode === 'hdri' ? hdris.find((h) => h.id === sky.hdriId) ?? hdris[0] : undefined;
  const procedural = <ProceduralSky direction={state.direction} daylight={state.daylight} />;
  let backdrop: React.ReactNode = procedural;
  if (sky.mode === 'color') backdrop = <ColorSky color={sky.color} daylight={state.daylight} />;
  else if (hdri) backdrop = <HdriBackdrop file={hdri.file} id={hdri.id} sceneProps={sceneProps} fallback={procedural} />;

  return (
    <>
      {backdrop}
      <InteriorEnvironment windowDir={windowDir} daylight={daylight} sceneProps={sceneProps} />
    </>
  );
});
