/**
 * Наполнение проёма: окно (рама, импосты, стекло, подоконник; панорамное — без подоконника)
 * или дверь (коробка, наличники, полотна на петлях — см. DoorMesh). Пустой дверной проём
 * остаётся открытым. Рисуется в локальной системе стены; стекло не отбрасывает тень,
 * поэтому солнце проходит внутрь.
 * @module editor-3d/ui/scene/OpeningMesh
 */

import React, { memo } from 'react';
import { Edges } from '@react-three/drei';
import { openingSill } from '../../lib/openings';
import type { Opening } from '../../types';
import { DoorMesh } from './DoorMesh';
import { HELPER_DATA, NO_RAYCAST, type SceneMouseEvent, type ScenePointerEvent } from './pointer';

interface OpeningMeshProps {
  opening: Opening;
  /** Толщина стены, м */
  thickness: number;
  /** Высота стены, м */
  wallHeight: number;
  selected: boolean;
  onPointerDown?: (e: ScenePointerEvent) => void;
  onPointerMove?: (e: ScenePointerEvent) => void;
  onPointerUp?: (e: ScenePointerEvent) => void;
  onPointerCancel?: (e: ScenePointerEvent) => void;
  onClick?: (e: SceneMouseEvent) => void;
}

const FRAME = 0.06;
const FRAME_COLOR = '#f4f1ec';
const SELECTED = '#c9a96e';
/** Ниже этой высоты окно панорамное — подоконника нет. */
const MIN_SILL_BOARD = 0.05;

/** Брусок рамы (бросает тень, при срезе стены скрывается). */
const Bar: React.FC<{ size: [number, number, number]; pos: [number, number, number]; color?: string }> = ({
  size,
  pos,
  color = FRAME_COLOR,
}) => (
  <mesh position={pos} castShadow receiveShadow userData={{ hideOnCut: true }}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.5} />
  </mesh>
);

const WindowFill: React.FC<{ opening: Opening; thickness: number }> = ({ opening, thickness }) => {
  const { width: w, height: h } = opening;
  const depth = Math.min(0.08, thickness * 0.6);
  const mullions = w > 1.3 ? Math.round(w / 0.9) - 1 : 0;
  return (
    <>
      <Bar size={[w, FRAME, depth]} pos={[0, h / 2 - FRAME / 2, 0]} />
      <Bar size={[w, FRAME, depth]} pos={[0, -h / 2 + FRAME / 2, 0]} />
      <Bar size={[FRAME, h, depth]} pos={[-w / 2 + FRAME / 2, 0, 0]} />
      <Bar size={[FRAME, h, depth]} pos={[w / 2 - FRAME / 2, 0, 0]} />
      {Array.from({ length: mullions }, (_, i) => (
        <Bar key={i} size={[FRAME * 0.7, h, depth * 0.8]} pos={[-w / 2 + ((i + 1) * w) / (mullions + 1), 0, 0]} />
      ))}
      <mesh userData={{ hideOnCut: true }}>
        <planeGeometry args={[w - FRAME, h - FRAME]} />
        <meshStandardMaterial color="#cfe3f0" transparent opacity={0.16} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>
      {openingSill(opening) >= MIN_SILL_BOARD && (
        <Bar size={[w + 0.1, 0.035, thickness / 2 + 0.08]} pos={[0, -h / 2 - 0.0175, thickness / 4 + 0.04]} color="#ece7df" />
      )}
    </>
  );
};

/** Проём в локальной системе стены (u, y — центр проёма). */
export const OpeningMesh: React.FC<OpeningMeshProps> = memo(({ opening, thickness, wallHeight, selected, ...handlers }) => (
  <group position={[opening.position[0], opening.position[1], 0]} {...handlers}>
    {opening.type === 'window' && <WindowFill opening={opening} thickness={thickness} />}
    {opening.type === 'door' && opening.door && <DoorMesh opening={opening} door={opening.door} thickness={thickness} wallHeight={wallHeight} />}
    {/* Невидимая «ручка» для выбора: весь проём кликабелен */}
    <mesh userData={{ hideOnCut: true }}>
      <boxGeometry args={[opening.width, opening.height, thickness + 0.04]} />
      <meshBasicMaterial visible={false} />
      {selected && <Edges color={SELECTED} lineWidth={2} raycast={NO_RAYCAST} userData={HELPER_DATA} />}
    </mesh>
  </group>
));
