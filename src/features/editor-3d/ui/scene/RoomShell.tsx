/**
 * Оболочка активного этажа: пол и плита над ним (с вырезами под лестницы), внешние стены
 * с проёмами и перегородки. Клик по полу/потолку выделяет поверхность (её отделка —
 * в инспекторе), клик по полу внутри помещения — помещение.
 * @module editor-3d/ui/scene/RoomShell
 */

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { buildingSelectors } from '../../building/selectors';
import { selectWallLayout } from '../../layoutSelectors';
import { floorSlabs } from '../../lib/building/slabs';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { WALL_SIDES } from '../../lib/walls';
import { FloorSlabs } from './building/FloorSlabs';
import { PartitionMesh } from './PartitionMesh';
import { floorRay, isClick, rayToFloor, type SceneMouseEvent } from './pointer';
import { WallMesh } from './WallMesh';

interface RoomShellProps {
  /** Срез стен и потолка (облёт, план, фикс-виды) */
  cutaway: boolean;
}

/** Перекрытия активного этажа (вырезы — под его лестницы и лестницы этажа ниже). */
function useActiveSlabs() {
  const dimensions = useSelector(editorSelectors.selectDimensions);
  const outerWalls = useSelector(editorSelectors.selectOuterWalls);
  const stairs = useSelector(editorSelectors.selectStairs);
  const frame = useSelector(buildingSelectors.selectActiveFrame);
  const below = useSelector(buildingSelectors.selectFloorBelow);
  const slab = useSelector(buildingSelectors.selectSlabThickness);
  return useMemo(() => floorSlabs({ frame, content: { dimensions, outerWalls, stairs } }, below, slab), [frame, dimensions, outerWalls, stairs, below, slab]);
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
  const slabs = useActiveSlabs();
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : null;

  const onFloorClick = (e: SceneMouseEvent) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    // Стены рисует WallDrawController, лестницы ставит StairTool (клик по полу сквозь стены и мебель).
    if (activeTool === 'partition' || activeTool === 'stair') return;
    const hit = rayToFloor(floorRay(e.ray));
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
      <FloorSlabs slabs={slabs} finishes={finishes} height={dims.height} cutCeiling={cutaway} onFloorClick={onFloorClick} onCeilingClick={onCeilingClick} />
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
