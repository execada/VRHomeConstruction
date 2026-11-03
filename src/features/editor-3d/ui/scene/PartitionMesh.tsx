/**
 * Внутренняя стена (перегородка) в 3D: тело с проёмами и стыками с другими стенами
 * (торцы «на ус», по грани соседней стены, скруглённые), перетаскивание по полу,
 * выделение, создание проёмов инструментами окна/двери.
 * @module editor-3d/ui/scene/PartitionMesh
 */

import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Edges } from '@react-three/drei';
import { add2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { partitionMaterial } from '../../lib/partitions';
import type { InteriorWallShape } from '../../lib/wallJoints';
import { partitionFrame, type WallFrame } from '../../lib/walls';
import type { Opening, Partition, SurfaceFinish } from '../../types';
import { OpeningMesh } from './OpeningMesh';
import { HELPER_DATA, NO_RAYCAST, rayToFloor, rayToWall } from './pointer';
import { useDragGesture } from './useDragGesture';
import { InteriorWallPieces } from './InteriorWallPieces';
import { useOpeningDrag } from './useOpeningDrag';
import { useWallLook } from './useWallLook';

interface PartitionMeshProps {
  partition: Partition;
  /** Форма стены с учётом стыков */
  shape: InteriorWallShape | undefined;
  /** Отделка по умолчанию (как у стен комнаты) */
  fallbackFinish: SurfaceFinish;
  selected: boolean;
  selectedOpeningId: string | null;
}

const SELECTED_COLOR = '#c9a96e';

const PartitionOpening: React.FC<{ partition: Partition; frame: WallFrame; opening: Opening; selected: boolean }> = ({
  partition,
  frame,
  opening,
  selected,
}) => {
  const handlers = useOpeningDrag(partition.id, frame, opening);
  return <OpeningMesh opening={opening} thickness={partition.size[2]} wallHeight={partition.size[1]} selected={selected} {...handlers} />;
};

export const PartitionMesh: React.FC<PartitionMeshProps> = memo(({ partition, shape, fallbackFinish, selected, selectedOpeningId }) => {
  const commands = useSceneCommands();
  const activeTool = useSelector(editorSelectors.selectActiveTool);
  const look = useWallLook(partition.finish ?? fallbackFinish, partitionMaterial(partition));
  const frame = useMemo(() => partitionFrame(partition), [partition]);
  const [length, height, thickness] = partition.size;

  const drag = useDragGesture<{ offset: Vec2; planeY: number }>({
    id: partition.id,
    onStart: (e) => {
      if (activeTool === 'partition') return null;
      if (activeTool === 'window' || activeTool === 'door') {
        const hit = rayToWall(e.ray, frame);
        commands.openings.add(partition.id, activeTool, hit?.u ?? 0);
        return null;
      }
      commands.select({ kind: 'partition', id: partition.id });
      const planeY = e.point.y;
      const hit = rayToFloor(e.ray, planeY);
      return hit ? { offset: sub2([partition.position[0], partition.position[2]], hit), planeY } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToFloor(e.ray, ctx.planeY);
      if (hit) commands.partitions.move(partition.id, add2(hit, ctx.offset));
    },
    onEnd: () => commands.partitions.endGesture(),
  });

  return (
    <group position={[partition.position[0], 0, partition.position[2]]} rotation={[0, partition.rotation[1], 0]}>
      <group {...drag}>
        <InteriorWallPieces spans={shape?.spans ?? []} length={length} height={height} openings={partition.openings} look={look} />
      </group>
      {partition.openings.map((o) => (
        <PartitionOpening key={o.id} partition={partition} frame={frame} opening={o} selected={o.id === selectedOpeningId} />
      ))}
      {selected && (
        <mesh position={[0, height / 2, 0]} raycast={NO_RAYCAST} userData={HELPER_DATA}>
          <boxGeometry args={[length + 0.02, height + 0.02, thickness + 0.02]} />
          <meshBasicMaterial visible={false} />
          <Edges color={SELECTED_COLOR} raycast={NO_RAYCAST} />
        </mesh>
      )}
    </group>
  );
});
