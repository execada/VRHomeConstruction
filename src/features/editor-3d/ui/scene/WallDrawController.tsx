/**
 * Рисование внутренних стен в 3D: клики по полу (сквозь стены и мебель — точка берётся
 * на плоскости пола под курсором), «призрак» стены с длиной и маркер привязки.
 * Пока инструмент активен, перетаскивание объектов отключено.
 * @module editor-3d/ui/scene/WallDrawController
 */

import React, { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { length2, sub2 } from '@/shared/lib/math/geometry2d';
import { useExternalStore } from '@/shared/lib/externalStore';
import { formatMeters } from '@/shared/lib/units';
import { selectors as editorSelectors } from '../../selectors';
import { interaction, interactionStore, type WallDraft } from '../../model/interactionStore';
import { sceneBridge } from '../../model/sceneBridge';
import { useWallDrawing } from '../../model/useWallDrawing';
import type { SnapKind } from '../../lib/wallSnap';
import { CLICK_TOLERANCE_PX, HELPER_DATA, NO_RAYCAST } from './pointer';

const GHOST_THICKNESS = 0.1;
const SNAP_COLORS: Record<SnapKind, string> = {
  endpoint: '#e0703a',
  wall: '#c9a96e',
  outer: '#c9a96e',
  angle: '#5b8fd6',
  grid: '#8a9a6b',
  none: '#9a958c',
};

/** Призрак рисуемой стены: прозрачный блок, маркер привязки и длина. */
const DraftGhost: React.FC<{ draft: WallDraft; height: number }> = ({ draft, height }) => {
  const { start, cursor, snap } = draft;
  const segment = useMemo(() => {
    if (!start) return null;
    const d = sub2(cursor, start);
    const length = length2(d);
    return length < 1e-3 ? null : { length, angle: Math.atan2(-d[1], d[0]), mid: [(start[0] + cursor[0]) / 2, (start[1] + cursor[1]) / 2] as const };
  }, [start, cursor]);
  return (
    <group userData={HELPER_DATA}>
      <mesh position={[cursor[0], 0.012, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.07, 0.11, 24]} />
        <meshBasicMaterial color={SNAP_COLORS[snap]} depthTest={false} transparent opacity={0.95} />
      </mesh>
      {segment && (
        <group position={[segment.mid[0], 0, segment.mid[1]]} rotation={[0, segment.angle, 0]}>
          <mesh position={[0, height / 2, 0]} raycast={NO_RAYCAST}>
            <boxGeometry args={[segment.length, height, GHOST_THICKNESS]} />
            <meshBasicMaterial color="#c9a96e" transparent opacity={0.32} depthWrite={false} />
          </mesh>
          <Html position={[0, height + 0.15, 0]} center style={{ pointerEvents: 'none' }}>
            <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(30,28,25,0.8)', color: '#fff', font: '600 12px system-ui', whiteSpace: 'nowrap' }}>
              {formatMeters(segment.length)}
            </span>
          </Html>
        </group>
      )}
    </group>
  );
};

export const WallDrawController: React.FC = () => {
  const element = useThree((s) => s.gl.domElement);
  const dims = useSelector(editorSelectors.selectDimensions);
  const drawing = useWallDrawing();
  const draft = useExternalStore(interactionStore, (s) => s.wallDraft);

  useEffect(() => {
    let down: { x: number; y: number } | null = null;
    const floor = (e: PointerEvent) => sceneBridge.screenToFloor(e.clientX, e.clientY);
    const onMove = (e: PointerEvent) => {
      const p = floor(e);
      if (p) drawing.hover(p);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
      if (e.button === 2) drawing.finish();
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      const p = moved <= CLICK_TOLERANCE_PX ? floor(e) : null;
      if (p) drawing.click(p);
    };
    const onMenu = (e: Event) => e.preventDefault();
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('contextmenu', onMenu);
    interaction.setDrawingWalls(true);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('contextmenu', onMenu);
      interaction.setDrawingWalls(false);
    };
  }, [element, drawing]);

  return draft ? <DraftGhost draft={draft} height={dims.height} /> : null;
};
