/**
 * Подсказки поверхностей: пока размещается или перетаскивается небольшой предмет (лампа,
 * ваза, книги), на столешницах и полках, куда он помещается, видны полупрозрачные площадки;
 * площадка, на которую он встанет, подсвечена ярче. Площадки — вспомогательные объекты
 * редактора: не перехватывают указатель и не попадают в превью проекта.
 * @module editor-3d/ui/scene/SurfaceHints
 */

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Edges } from '@react-three/drei';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { surfacesStore } from '@/features/furniture/surfacesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { pointInObb, type Vec2 } from '@/shared/lib/math/geometry2d';
import { selectors as editorSelectors } from '../../selectors';
import { interactionStore } from '../../model/interactionStore';
import { itemSizes } from '../../lib/placement';
import { furnitureRole } from '../../lib/supportRole';
import { roomSurfaces, surfacesFitting, type SupportSurface } from '../../lib/surfaces';
import { HELPER_DATA, NO_RAYCAST } from './pointer';
import { DRAFT_ID, useHintSubject } from './useHintSubject';

/** Холодный цвет: хорошо виден на дереве, ткани и светлых столешницах. */
const HINT_COLOR = '#3b8beb';
const HINT_OPACITY = 0.2;
const ACTIVE_OPACITY = 0.45;
/** Подъём площадки над поверхностью, чтобы она не мерцала вместе со столешницей. */
const LIFT = 0.004;
const SAME_LEVEL = 0.02;

/** Где предмет сейчас: опора, высота и центр на плане (у призрака — его поверхность). */
function useActiveSurface(subject: FurnitureItem | null): { supportId: string | null; y: number; center: Vec2 } {
  const ghostSupport = useExternalStore(interactionStore, (s) => s.ghost?.supportId ?? null);
  const ghostY = useExternalStore(interactionStore, (s) => s.ghost?.elevation ?? 0);
  const ghostX = useExternalStore(interactionStore, (s) => s.ghost?.center[0] ?? 0);
  const ghostZ = useExternalStore(interactionStore, (s) => s.ghost?.center[1] ?? 0);
  if (subject?.id === DRAFT_ID) return { supportId: ghostSupport, y: ghostY, center: [ghostX, ghostZ] };
  return { supportId: subject?.supportId ?? null, y: subject?.position[1] ?? 0, center: [subject?.position[0] ?? 0, subject?.position[2] ?? 0] };
}

const HintPlane: React.FC<{ surface: SupportSurface; active: boolean }> = ({ surface, active }) => (
  <mesh
    position={[surface.area.center[0], surface.y + LIFT, surface.area.center[1]]}
    rotation={[-Math.PI / 2, 0, surface.area.angle]}
    raycast={NO_RAYCAST}
    renderOrder={2}
  >
    <planeGeometry args={[surface.area.half[0] * 2, surface.area.half[1] * 2]} />
    <meshBasicMaterial color={HINT_COLOR} transparent opacity={active ? ACTIVE_OPACITY : HINT_OPACITY} depthWrite={false} toneMapped={false} />
    <Edges color={HINT_COLOR} transparent opacity={active ? 1 : 0.6} raycast={NO_RAYCAST} />
  </mesh>
);

export const SurfaceHints: React.FC = () => {
  const subject = useHintSubject();
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const ceiling = useSelector(editorSelectors.selectDimensions).height;
  const measured = useExternalStore(surfacesStore, (s) => s.byPath);
  const active = useActiveSurface(subject);
  const surfaces = useMemo(() => {
    if (!subject || furnitureRole(subject) !== 'surface') return [];
    const { halfWidth, halfDepth, height } = itemSizes(subject);
    return surfacesFitting(roomSurfaces(items, (path) => measured.get(path), ceiling, subject.id), [halfWidth, halfDepth], height);
  }, [subject, items, measured, ceiling]);

  if (surfaces.length === 0) return null;
  const isActive = (s: SupportSurface) =>
    s.supportId === active.supportId && Math.abs(s.y - active.y) < SAME_LEVEL && pointInObb(active.center, s.area);
  return (
    <group userData={HELPER_DATA}>
      {surfaces.map((s) => (
        <HintPlane key={`${s.supportId}:${s.y.toFixed(3)}:${s.area.center.join(',')}`} surface={s} active={isActive(s)} />
      ))}
    </group>
  );
};
