/**
 * Камера и графика: режим камеры, фиксированные виды, столкновения;
 * пресеты качества, тени, размер карты теней, разрешение, сглаживание, счётчик FPS.
 * @module widgets/editor-panel/ui/ViewPanel
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CameraFeature, type CameraMode, type FixedView } from '@/features/camera';
import { FIXED_VIEW_LABELS } from '@/features/camera/lib/views';
import { GraphicsFeature, type ShadowMapSize } from '@/features/graphics';
import { PRESET_LABELS, RESOLUTION_SCALE_RANGE, SHADOW_MAP_SIZES } from '@/features/graphics/lib/presets';
import { Button, Section, Segmented, Slider, Toggle } from '@/shared/ui/controls';
import styles from './EditorPanel.module.scss';

const MODES: Array<{ value: CameraMode; label: string; icon: 'orbit' | 'walk' | 'plan' }> = [
  { value: 'orbit', label: 'Облёт', icon: 'orbit' },
  { value: 'fps', label: 'От лица', icon: 'walk' },
  { value: 'top', label: 'План', icon: 'plan' },
];

const CameraSection: React.FC = () => {
  const dispatch = useDispatch();
  const mode = useSelector(CameraFeature.selectors.selectCameraMode);
  const view = useSelector(CameraFeature.selectors.selectFixedView);
  const collisions = useSelector(CameraFeature.selectors.selectCollisions);
  return (
    <Section title="Камера">
      <Segmented ariaLabel="Режим камеры" options={MODES} value={mode === 'fixed' ? 'orbit' : mode} onChange={(m) => dispatch(CameraFeature.actions.setMode(m))} />
      <div className={styles.actions}>
        {(Object.keys(FIXED_VIEW_LABELS) as FixedView[]).map((v) => (
          <Button key={v} size="sm" variant={mode === 'fixed' && view === v ? 'primary' : 'secondary'} onClick={() => dispatch(CameraFeature.actions.setFixedView(v))}>
            {FIXED_VIEW_LABELS[v]}
          </Button>
        ))}
      </div>
      <Toggle label="Столкновения (от первого лица)" checked={collisions} onChange={(on) => dispatch(CameraFeature.actions.setCollisions(on))} />
      <Button size="sm" icon="rotate" onClick={() => dispatch(CameraFeature.actions.resetView())}>
        Сбросить вид
      </Button>
    </Section>
  );
};

const GraphicsSection: React.FC = () => {
  const dispatch = useDispatch();
  const g = useSelector(GraphicsFeature.selectors.selectGraphics);
  const update = (patch: Parameters<typeof GraphicsFeature.actions.updateGraphics>[0]) => dispatch(GraphicsFeature.actions.updateGraphics(patch));
  return (
    <Section title={`Графика · ${PRESET_LABELS[g.preset]}`}>
      <Segmented
        ariaLabel="Пресет качества"
        options={[
          { value: 'low' as const, label: PRESET_LABELS.low },
          { value: 'medium' as const, label: PRESET_LABELS.medium },
          { value: 'high' as const, label: PRESET_LABELS.high },
        ]}
        value={g.preset === 'custom' ? 'medium' : g.preset}
        onChange={(preset) => dispatch(GraphicsFeature.actions.setPreset(preset))}
      />
      <Toggle label="Тени" checked={g.shadows} onChange={(shadows) => update({ shadows })} />
      <Segmented
        ariaLabel="Размер карты теней"
        options={SHADOW_MAP_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
        value={String(g.shadowMapSize)}
        onChange={(s) => update({ shadowMapSize: Number(s) as ShadowMapSize })}
      />
      <Slider
        label="Разрешение рендера"
        value={Math.round(g.resolutionScale * 100)}
        min={RESOLUTION_SCALE_RANGE[0] * 100}
        max={RESOLUTION_SCALE_RANGE[1] * 100}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => update({ resolutionScale: v / 100 })}
      />
      <Toggle label="Сглаживание (anti-aliasing)" checked={g.antialias} onChange={(antialias) => update({ antialias })} />
      <Toggle label="Счётчик FPS" checked={g.showFps} onChange={(showFps) => update({ showFps })} />
    </Section>
  );
};

export const ViewPanel: React.FC = () => (
  <>
    <h2 className={styles.panelTitle}>Камера и графика</h2>
    <CameraSection />
    <GraphicsSection />
  </>
);
