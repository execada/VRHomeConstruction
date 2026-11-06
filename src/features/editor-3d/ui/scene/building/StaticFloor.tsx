/**
 * Неактивный этаж здания — только показ: перекрытия с вырезами, внешние стены с окнами
 * и дверями, внутренние стены, лестницы и мебель. Указатель он не перехватывает
 * (редактируется только активный этаж), поэтому клики не уходят к объектам за ним.
 * @module editor-3d/ui/scene/building/StaticFloor
 */

import React, { memo, useMemo } from 'react';
import { cachedWallLayout } from '../../../lib/layoutCache';
import { floorRise, type FloorFrame } from '../../../lib/building/floors';
import { floorSlabs } from '../../../lib/building/slabs';
import { stairLayout } from '../../../lib/stairs/stairs';
import { WALL_SIDES } from '../../../lib/walls';
import type { FloorContent, Stair } from '../../../types';
import { FurnitureNode } from '../FurnitureNode';
import { PartitionMesh } from '../PartitionMesh';
import type { SceneMouseEvent, ScenePointerEvent } from '../pointer';
import { StairMesh } from '../stairs/StairMesh';
import { WallMesh } from '../WallMesh';
import { FloorSlabs } from './FloorSlabs';

const swallow = (e: SceneMouseEvent | ScenePointerEvent) => e.stopPropagation();

const StaticStair: React.FC<{ stair: Stair; rise: number }> = memo(({ stair, rise }) => {
  const layout = useMemo(() => stairLayout(stair.kind, rise, stair.width), [stair.kind, rise, stair.width]);
  return <StairMesh stair={stair} layout={layout} />;
});

interface StaticFloorProps {
  content: FloorContent;
  frame: FloorFrame;
  /** Лестницы и положение этажа ниже (вырезы в полу над его лестницами); null — первый этаж */
  belowStairs: Stair[] | null;
  belowFrame: FloorFrame | null;
  slab: number;
}

export const StaticFloor: React.FC<StaticFloorProps> = memo(({ content, frame, belowStairs, belowFrame, slab }) => {
  const layout = cachedWallLayout(content.dimensions, content.partitions);
  const slabs = useMemo(() => {
    const below = belowStairs && belowFrame ? { frame: belowFrame, content: { stairs: belowStairs } } : null;
    return floorSlabs({ frame, content: { dimensions: content.dimensions, outerWalls: content.outerWalls, stairs: content.stairs } }, below, slab);
  }, [frame, content.dimensions, content.outerWalls, content.stairs, belowStairs, belowFrame, slab]);
  const rise = floorRise(frame, slab);
  return (
    <group position={[frame.offset[0], frame.base, frame.offset[1]]} onClick={swallow} onPointerDown={swallow}>
      <FloorSlabs slabs={slabs} finishes={content.finishes} height={content.dimensions.height} cutCeiling={false} />
      {WALL_SIDES.filter((side) => !content.removedWalls.includes(side)).map((side) => (
        <WallMesh
          key={side}
          side={side}
          dims={content.dimensions}
          outerWalls={content.outerWalls}
          removed={content.removedWalls}
          openings={content.openings[side] ?? []}
          finish={content.finishes.walls[side]}
          selected={false}
          selectedOpeningId={null}
          cutaway={false}
          interactive={false}
        />
      ))}
      {content.partitions.map((p) => (
        <PartitionMesh
          key={p.id}
          partition={p}
          shape={layout.interior[p.id]}
          fallbackFinish={content.finishes.walls.front}
          selected={false}
          selectedOpeningId={null}
          interactive={false}
        />
      ))}
      {content.stairs.map((s) => (
        <StaticStair key={s.id} stair={s} rise={rise} />
      ))}
      {content.furniture.map((item) => (
        <FurnitureNode key={item.id} item={item} selected={false} interactive={false} />
      ))}
    </group>
  );
});
