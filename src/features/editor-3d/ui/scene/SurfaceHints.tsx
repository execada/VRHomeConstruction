/**
 * Подсказки поверхностей: пока размещается или перетаскивается небольшой предмет (лампа,
 * ваза, книги), на столешницах и полках, куда он помещается, видны полупрозрачные площадки;
 * площадка, на которую он встанет, подсвечена ярче. Площадки — вспомогательные объекты
 * редактора: не перехватывают указатель и не попадают в превью проекта.
 * @module editor-3d/ui/scene/SurfaceHints
 */

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import { surfacesStore } from '@/features/furniture/surfacesCache';
import type { FurnitureItem } from '@/features/furniture/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { selectors as editorSelectors } from '../../selectors';
import { interactionStore } from '../../model/interactionStore';
import { itemSizes } from '../../lib/placement';
import { furnitureRole } from '../../lib/supportRole';
import { roomSurfaces, surfacesFitting, type SupportSurface } from '../../lib/surfaces';
import { HELPER_DATA, NO_RAYCAST } from './pointer';

const HINT_COLOR = '#c9a96e';
const HINT_OPACITY = 0.16;
const ACTIVE_OPACITY = 0.42;
/** Подъём площадки над поверхностью, чтобы она не мерцала вместе со столешницей. */
const LIFT = 0.004;
const SAME_LEVEL = 0.02;

/** Предмет, для которого показываются поверхности: размещаемая модель или перетаскиваемый предмет. */
function useSubject(): FurnitureItem | null {
  const mode = useExternalStore(interactionStore, (s) => s.mode);
  const path = useExternalStore(interactionStore, (s) => s.placingPath);
  const name = useExternalStore(interactionStore, (s) => s.placingName);
  const activeId = useExternalStore(interactionStore, (s) => s.activeId);
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  return useMemo(() => {
    if (mode === 'dragging' && activeId) return items.find((i) => i.id === activeId) ?? null;
    if (mode !== 'placing' || !path) return null;
    const sizes = furnitureSizesCache.get(path);
    return { id: '__hint__', name: name ?? '', modelPath: path, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, ...sizes };
  }, [mode, path, name, activeId, items]);
}

/** Где предмет сейчас: опора и высота (у призрака — его поверхность). */
function useActiveSurface(subject: FurnitureItem | null): { supportId: string | null; y: number } {
  const ghostSupport = useExternalStore(interactionStore, (s) => s.ghost?.supportId ?? null);
  const ghostY = useExternalStore(interactionStore, (s) => s.ghost?.elevation ?? 0);
  if (subject?.id === '__hint__') return { supportId: ghostSupport, y: ghostY };
  return { supportId: subject?.supportId ?? null, y: subject?.position[1] ?? 0 };
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
  </mesh>
);

export const SurfaceHints: React.FC = () => {
  const subject = useSubject();
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
  const isActive = (s: SupportSurface) => s.supportId === active.supportId && Math.abs(s.y - active.y) < SAME_LEVEL;
  return (
    <group userData={HELPER_DATA}>
      {surfaces.map((s) => (
        <HintPlane key={`${s.supportId}:${s.y.toFixed(3)}:${s.area.center.join(',')}`} surface={s} active={isActive(s)} />
      ))}
    </group>
  );
};
