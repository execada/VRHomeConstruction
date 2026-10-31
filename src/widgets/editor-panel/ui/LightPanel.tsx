/**
 * Свет и окружение: свет комнаты (вкл/выкл, температура или цвет, яркость, тени),
 * солнце (сторона, время суток, интенсивность, тени), небо/HDRI-пейзаж.
 * @module widgets/editor-panel/ui/LightPanel
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { selectors as assetSelectors } from '@/features/assets/selectors';
import { EnvironmentFeature } from '@/features/environment';
import { LIGHT_LIMITS } from '@/features/editor-3d/constants';
import { formatHour } from '@/features/editor-3d/lib/sun';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { ColorField, Section, Segmented, Slider, Toggle } from '@/shared/ui/controls';
import styles from './EditorPanel.module.scss';

const RoomLightSection: React.FC = () => {
  const commands = useSceneCommands();
  const light = useSelector(editorSelectors.selectLightConfig);
  const set = commands.room.setLight;
  return (
    <Section title="Свет в комнате" action={<Toggle label={light.enabled ? "Вкл" : "Выкл"} checked={light.enabled} onChange={(enabled) => set({ enabled })} />}>
      <Segmented
        ariaLabel="Цвет света"
        options={[
          { value: 'temperature' as const, label: 'Температура' },
          { value: 'color' as const, label: 'Цвет' },
        ]}
        value={light.colorMode}
        onChange={(colorMode) => set({ colorMode })}
      />
      {light.colorMode === 'temperature' ? (
        <Slider label="Температура" value={light.temperature} min={LIGHT_LIMITS.temperature[0]} max={LIGHT_LIMITS.temperature[1]} step={50} format={(v) => `${v} K`} onChange={(temperature) => set({ temperature })} />
      ) : (
        <ColorField label="Цвет света" value={light.color} onChange={(color) => set({ color })} />
      )}
      <Slider label="Яркость" value={light.intensity} min={LIGHT_LIMITS.intensity[0]} max={LIGHT_LIMITS.intensity[1]} step={0.05} format={(v) => v.toFixed(2)} onChange={(intensity) => set({ intensity })} />
      <Slider label="Рассеянный свет" value={light.ambientIntensity} min={LIGHT_LIMITS.ambientIntensity[0]} max={LIGHT_LIMITS.ambientIntensity[1]} step={0.05} format={(v) => v.toFixed(2)} onChange={(ambientIntensity) => set({ ambientIntensity })} />
      <Toggle label="Тени от светильников" checked={light.shadows} onChange={(shadows) => set({ shadows })} />
    </Section>
  );
};

const SunSection: React.FC = () => {
  const dispatch = useDispatch();
  const sun = useSelector(EnvironmentFeature.selectors.selectSun);
  const set = (patch: Parameters<typeof EnvironmentFeature.actions.setSun>[0]) => dispatch(EnvironmentFeature.actions.setSun(patch));
  return (
    <Section title="Солнце" action={<Toggle label={sun.enabled ? "Вкл" : "Выкл"} checked={sun.enabled} onChange={(enabled) => set({ enabled })} />}>
      <Segmented
        ariaLabel="Сторона солнца"
        options={[
          { value: 'front' as const, label: 'Со стороны передней стены' },
          { value: 'back' as const, label: 'Задней' },
        ]}
        value={sun.side}
        onChange={(side) => set({ side })}
      />
      <Slider label="Время суток" value={sun.timeOfDay} min={0} max={24} step={0.25} format={formatHour} onChange={(timeOfDay) => set({ timeOfDay })} />
      <Slider label="Интенсивность" value={sun.intensity} min={0} max={8} step={0.1} format={(v) => v.toFixed(1)} onChange={(intensity) => set({ intensity })} />
      <Toggle label="Тени от солнца" checked={sun.shadows} onChange={(shadows) => set({ shadows })} />
    </Section>
  );
};

const SkySection: React.FC = () => {
  const dispatch = useDispatch();
  const sky = useSelector(EnvironmentFeature.selectors.selectSky);
  const hdris = useSelector(assetSelectors.selectHdris);
  const set = (patch: Parameters<typeof EnvironmentFeature.actions.setSky>[0]) => dispatch(EnvironmentFeature.actions.setSky(patch));
  return (
    <Section title="Вид из окна">
      <Segmented
        ariaLabel="Фон"
        options={[
          { value: 'hdri' as const, label: 'Пейзаж' },
          { value: 'sky' as const, label: 'Небо' },
          { value: 'color' as const, label: 'Цвет' },
        ]}
        value={sky.mode}
        onChange={(mode) => set({ mode })}
      />
      {sky.mode === 'hdri' && (
        <div className={styles.hdriGrid}>
          {hdris.map((h) => (
            <button key={h.id} type="button" className={cn(styles.hdri, (sky.hdriId ?? hdris[0]?.id) === h.id && styles.hdriActive)} onClick={() => set({ hdriId: h.id })}>
              <span className={styles.hdriPreview} style={{ backgroundImage: `url("${h.thumbnail}")` }} />
              {h.label}
            </button>
          ))}
          {hdris.length === 0 && <span className={styles.muted}>Пейзажи загружаются…</span>}
        </div>
      )}
      {sky.mode === 'color' && <ColorField label="Цвет неба" value={sky.color} onChange={(color) => set({ color })} />}
      {sky.mode === 'hdri' && (
        <>
          <Slider label="Поворот пейзажа" value={sky.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(rotation) => set({ rotation })} />
          <Slider label="Яркость пейзажа" value={sky.exposure} min={0.1} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(exposure) => set({ exposure })} />
        </>
      )}
    </Section>
  );
};

export const LightPanel: React.FC = () => (
  <>
    <h2 className={styles.panelTitle}>Свет и окружение</h2>
    <RoomLightSection />
    <SunSection />
    <SkySection />
  </>
);
