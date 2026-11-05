/**
 * Вид из окна. Фотопанорама: резкий снимок как бесконечно далёкий фон и настоящий участок
 * вокруг квартиры — газон до горизонта или высотка над городом (см. site/PanoramaSite).
 * Процедурное небо, синхронное с солнцем, или сплошной цвет неба — с тем же газоном,
 * уходящим в дымку. Ночью фон и дымка плавно гаснут. Без снимка или при ошибке его
 * загрузки — процедурное небо. Отражения и рассеянный свет интерьера — отдельное
 * «комнатное» окружение (InteriorEnvironment), а не уличное небо.
 * @module editor-3d/ui/scene/EnvironmentBackdrop
 */

import React, { Suspense, memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Sky } from '@react-three/drei';
import { selectors as assetSelectors } from '@/features/assets/selectors';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { mixHex } from '@/shared/lib/color/colorTemperature';
import { ErrorBoundary } from '@/shared/ui/error-boundary/ErrorBoundary';
import { fogRange } from '../../lib/site';
import { sunState } from '../../lib/sun';
import { InteriorEnvironment, type EnvSceneProps } from './InteriorEnvironment';
import { GroundSite } from './site/GroundSite';
import { PanoramaSite } from './site/PanoramaSite';

const NIGHT_SKY = '#0d1626';
/** Дымка у горизонта процедурного неба днём. */
const DAY_HAZE = '#c8d4df';
const DEG = Math.PI / 180;
const GROUND_FOG = fogRange('ground');

/** Газон вокруг дома, уходящий в дымку цвета неба у горизонта. */
const LawnInHaze: React.FC<{ haze: string }> = ({ haze }) => (
  <>
    <fog attach="fog" args={[haze, GROUND_FOG.near, GROUND_FOG.far]} />
    <GroundSite surface="lawn" />
  </>
);

/** Процедурное небо, синхронное с солнцем. */
const ProceduralSky: React.FC<{ direction: [number, number, number]; daylight: number }> = ({ direction, daylight }) => {
  const sunPosition = useMemo(() => direction.map((v) => v * 1000) as [number, number, number], [direction]);
  return (
    <>
      <Sky sunPosition={sunPosition} turbidity={6} rayleigh={0.6 + daylight * 1.4} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <LawnInHaze haze={mixHex(NIGHT_SKY, DAY_HAZE, daylight)} />
    </>
  );
};

/** Сплошной цвет неба (с учётом времени суток). */
const ColorSky: React.FC<{ color: string; daylight: number }> = ({ color, daylight }) => {
  const sky = mixHex(NIGHT_SKY, color, daylight);
  return (
    <>
      <color attach="background" args={[sky]} />
      <LawnInHaze haze={sky} />
    </>
  );
};

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
  const intensity = exposure * (0.06 + 0.94 * daylight);
  const sceneProps = useMemo<EnvSceneProps>(
    () => ({
      backgroundIntensity: 1,
      backgroundRotation: [0, 0, 0],
      environmentIntensity: 0.45 + 0.3 * daylight,
      environmentRotation: [0, 0, 0],
    }),
    [daylight],
  );
  const windowDir = useMemo<[number, number]>(() => [wx, wz], [wx, wz]);

  const hdri = sky.mode === 'hdri' ? hdris.find((h) => h.id === sky.hdriId) ?? hdris[0] : undefined;
  const procedural = <ProceduralSky direction={state.direction} daylight={state.daylight} />;
  let backdrop: React.ReactNode = procedural;
  if (sky.mode === 'color') backdrop = <ColorSky color={sky.color} daylight={state.daylight} />;
  else if (hdri?.backplate) {
    backdrop = (
      <ErrorBoundary fallback={procedural} context={`Панорама ${hdri.id}`} resetKey={hdri.id}>
        <Suspense fallback={procedural}>
          <PanoramaSite
            id={hdri.id}
            backplate={hdri.backplate}
            site={hdri.site}
            intensity={intensity}
            rotation={sky.rotation * DEG}
            daylight={daylight}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <>
      {backdrop}
      <InteriorEnvironment windowDir={windowDir} daylight={daylight} sceneProps={sceneProps} />
    </>
  );
});
