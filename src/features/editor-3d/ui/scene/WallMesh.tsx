/**
 * Внешняя стена комнаты: тело с проёмами, наполнение проёмов, выделение,
 * эффект «кукольного домика» и инструменты окна/двери (клик по стене создаёт проём).
 * @module editor-3d/ui/scene/WallMesh
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Edges } from '@react-three/drei';
import type { Group } from 'three';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { isWallFacingAway, wallBox, wallFrame, type WallFrame } from '../../lib/walls';
import type { Opening, OuterWalls, RoomDimensions, SurfaceFinish, WallSide } from '../../types';
import { useCutaway } from './cutaway';
import { OpeningMesh } from './OpeningMesh';
import { HELPER_DATA, isClick, NO_RAYCAST, rayToWall, type SceneMouseEvent } from './pointer';

const WALL_SELECTION_DATA = { ...HELPER_DATA, hideOnCut: true };
import { useOpeningDrag } from './useOpeningDrag';
import { useWallLook } from './useWallLook';
import { WallPieces } from './WallPieces';

interface WallMeshProps {
  side: WallSide;
  dims: RoomDimensions;
  /** Конструкция всех внешних стен (толщина соседей нужна для углов) */
  outerWalls: OuterWalls;
  /** Удалённые стены (на их углы стена не заходит) */
  removed: WallSide[];
  openings: Opening[];
  finish: SurfaceFinish;
  /** Выделена ли стена */
  selected: boolean;
  /** id выделенного проёма */
  selectedOpeningId: string | null;
  /** Включён ли срез стен (облёт, план, фикс-виды) */
  cutaway: boolean;
}

const SELECTED_COLOR = '#c9a96e';

const DraggableOpening: React.FC<{ side: WallSide; frame: WallFrame; opening: Opening; thickness: number; selected: boolean }> = ({
  side,
  frame,
  opening,
  thickness,
  selected,
}) => {
  const handlers = useOpeningDrag(side, frame, opening);
  return <OpeningMesh opening={opening} thickness={thickness} selected={selected} {...handlers} />;
};

export const WallMesh: React.FC<WallMeshProps> = memo(
  ({ side, dims, outerWalls, removed, openings, finish, selected, selectedOpeningId, cutaway }) => {
    const commands = useSceneCommands();
    const activeTool = useSelector(editorSelectors.selectActiveTool);
    const frame = useMemo(() => wallFrame(side, dims), [side, dims]);
    const box = useMemo(() => wallBox(side, dims, outerWalls, removed), [side, dims, outerWalls, removed]);
    const thickness = box.thickness;
    const look = useWallLook(finish, outerWalls[side].material);
    const shouldCut = useMemo(
      () => (cutaway ? (camera: { position: { x: number; z: number } }) => isWallFacingAway(frame, [camera.position.x, camera.position.z]) : null),
      [cutaway, frame],
    );
    const ref = useCutaway<Group>(shouldCut);

    const handleClick = (e: SceneMouseEvent) => {
      if (!isClick(e)) return;
      e.stopPropagation();
      if (activeTool === 'window' || activeTool === 'door') {
        const hit = rayToWall(e.ray, frame);
        commands.openings.add(side, activeTool, hit?.u ?? 0);
        return;
      }
      commands.select({ kind: 'wall', side });
    };

    return (
      <group ref={ref} position={[box.base[0], 0, box.base[1]]} rotation={[0, box.rotationY, 0]}>
        <group onClick={handleClick}>
          <WallPieces uMin={box.uMin} uMax={box.uMax} height={dims.height} thickness={thickness} openings={openings} look={look} />
        </group>
        {openings.map((o) => (
          <DraggableOpening key={o.id} side={side} frame={frame} opening={o} thickness={thickness} selected={o.id === selectedOpeningId} />
        ))}
        {selected && (
          <mesh position={[0, dims.height / 2, thickness / 2 + 0.003]} userData={WALL_SELECTION_DATA} raycast={NO_RAYCAST}>
            <planeGeometry args={[frame.length, dims.height]} />
            <meshBasicMaterial color={SELECTED_COLOR} transparent opacity={0.08} depthWrite={false} />
            <Edges color={SELECTED_COLOR} raycast={NO_RAYCAST} />
          </mesh>
        )}
      </group>
    );
  },
);
