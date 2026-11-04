/**
 * Оболочка комнаты: пол, потолок, внешние стены с проёмами и перегородки.
 * Клик по полу/потолку выделяет поверхность (её отделка — в инспекторе).
 * @module editor-3d/ui/scene/RoomShell
 */

import React, { memo, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { Group } from 'three';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { boxWithUv } from '@/features/textures/lib/uvGeometry';
import { useFinishMaterial } from '@/features/textures/model/useFinishMaterial';
import { selectWallLayout } from '../../layoutSelectors';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { outerBounds, WALL_SIDES } from '../../lib/walls';
import type { OuterWalls, RoomDimensions, SurfaceFinish } from '../../types';
import { useCutaway } from './cutaway';
import { PartitionMesh } from './PartitionMesh';
import { isClick, rayToFloor, type SceneMouseEvent } from './pointer';
import { WallMesh } from './WallMesh';

const SLAB = 0.05;

/** Плита пола или потолка (заходит под стены, чтобы не было щелей в углах). */
const Slab: React.FC<{
  dims: RoomDimensions;
  outerWalls: OuterWalls;
  finish: SurfaceFinish;
  kind: 'floor' | 'ceiling';
  onClick: (e: SceneMouseEvent) => void;
  cutaway: boolean;
}> = memo(({ dims, outerWalls, finish, kind, onClick, cutaway }) => {
  const { material, tile } = useFinishMaterial(finish, kind === 'floor' ? 'floor' : 'ceiling');
  const y = kind === 'floor' ? -SLAB / 2 : dims.height + SLAB / 2;
  const { geometry, center } = useMemo(() => {
    const b = outerBounds(dims, outerWalls);
    const mid: [number, number, number] = [(b.minX + b.maxX) / 2, y, (b.minZ + b.maxZ) / 2];
    return { geometry: boxWithUv([b.maxX - b.minX, SLAB, b.maxZ - b.minZ], mid, tile), center: mid };
  }, [dims, outerWalls, tile, y]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const shouldCut = useMemo(
    () => (kind === 'ceiling' && cutaway ? (camera: { position: { y: number } }) => camera.position.y > dims.height - 0.05 : null),
    [kind, cutaway, dims.height],
  );
  const ref = useCutaway<Group>(shouldCut);
  return (
    <group ref={ref}>
      <mesh geometry={geometry} material={material} position={center} receiveShadow castShadow={kind === 'ceiling'} onClick={onClick} />
    </group>
  );
});

interface RoomShellProps {
  /** Срез стен и потолка (облёт, план, фикс-виды) */
  cutaway: boolean;
}

export const RoomShell: React.FC<RoomShellProps> = ({ cutaway }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const outerWalls = useSelector(editorSelectors.selectOuterWalls);
  const finishes = useSelector(editorSelectors.selectFinishes);
  const openings = useSelector(editorSelectors.selectOpenings);
  const partitions = useSelector(editorSelectors.selectPartitions);
  const layout = useSelector(selectWallLayout);
  const removed = useSelector(editorSelectors.selectRemovedWalls);
  const activeTool = useSelector(editorSelectors.selectActiveTool);
  const selection = useSelector(selectionSelectors.selectSelection);
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : null;

  const onFloorClick = (e: SceneMouseEvent) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    // Стены рисует WallDrawController (клик по полу сквозь стены и мебель).
    if (activeTool === 'partition') return;
    const hit = rayToFloor(e.ray);
    const room = hit ? commands.rooms.at(hit) : null;
    commands.select(room && hit ? { kind: 'room', point: [hit[0], hit[1]] } : { kind: 'floor' });
  };

  const onCeilingClick = (e: SceneMouseEvent) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    commands.select({ kind: 'ceiling' });
  };

  return (
    <group>
      <Slab dims={dims} outerWalls={outerWalls} finish={finishes.floor} kind="floor" onClick={onFloorClick} cutaway={cutaway} />
      <Slab dims={dims} outerWalls={outerWalls} finish={finishes.ceiling} kind="ceiling" onClick={onCeilingClick} cutaway={cutaway} />
      {WALL_SIDES.filter((side) => !removed.includes(side)).map((side) => (
        <WallMesh
          key={side}
          side={side}
          dims={dims}
          outerWalls={outerWalls}
          removed={removed}
          openings={openings[side] ?? []}
          finish={finishes.walls[side]}
          selected={selection?.kind === 'wall' && selection.side === side}
          selectedOpeningId={selectedOpeningId}
          cutaway={cutaway}
        />
      ))}
      {partitions.map((p) => (
        <PartitionMesh
          key={p.id}
          partition={p}
          shape={layout.interior[p.id]}
          fallbackFinish={finishes.walls.front}
          selected={selection?.kind === 'partition' && selection.id === p.id}
          selectedOpeningId={selectedOpeningId}
        />
      ))}
    </group>
  );
};
