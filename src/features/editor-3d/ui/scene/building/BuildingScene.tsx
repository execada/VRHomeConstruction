/**
 * Здание в 3D: все этажи на своих высотах. Активный этаж (его можно редактировать) —
 * в группе на высоте его пола; остальные — только показ. В редакторских видах (облёт,
 * план, фикс-виды) этажи выше активного скрыты, чтобы его было видно; от первого лица,
 * в VR и в режиме «Улица» видно всё здание, с ограждениями террас и крыши.
 * @module editor-3d/ui/scene/building/BuildingScene
 */

import React, { useLayoutEffect } from 'react';
import { useSelector } from 'react-redux';
import { buildingSelectors } from '../../../building/selectors';
import { floorPlacementStore } from '../pointer';
import { RoofRailings } from './RoofRailings';
import { StaticFloor } from './StaticFloor';

interface BuildingSceneProps {
  /** Скрыть этажи выше активного (и ограждение его крыши) */
  hideAbove: boolean;
  /** Содержимое активного этажа (редактируемое) */
  children: React.ReactNode;
}

/** Группа активного этажа: его содержимое описано в координатах этажа. */
const ActiveFloorGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useSelector(buildingSelectors.selectActiveFrame);
  useLayoutEffect(() => {
    floorPlacementStore.setState({ base: frame.base, offset: frame.offset });
  }, [frame]);
  useLayoutEffect(() => () => floorPlacementStore.setState({ base: 0, offset: [0, 0] }), []);
  return <group position={[frame.offset[0], frame.base, frame.offset[1]]}>{children}</group>;
};

export const BuildingScene: React.FC<BuildingSceneProps> = ({ hideAbove, children }) => {
  const floors = useSelector(buildingSelectors.selectFloors);
  const activeIndex = useSelector(buildingSelectors.selectActiveIndex);
  const slab = useSelector(buildingSelectors.selectSlabThickness);
  return (
    <>
      {floors.map((f, i) => {
        if (i === activeIndex || (hideAbove && i > activeIndex)) return null;
        const below = i > 0 ? floors[i - 1] : null;
        return (
          <StaticFloor key={f.meta.id} content={f.content} frame={f.frame} belowStairs={below?.content.stairs ?? null} belowFrame={below?.frame ?? null} slab={slab} />
        );
      })}
      {floors.map((f, i) => {
        if (hideAbove && i >= activeIndex) return null;
        const up = floors[i + 1];
        return (
          <RoofRailings
            key={`rail-${f.meta.id}`}
            frame={f.frame}
            dims={f.content.dimensions}
            outerWalls={f.content.outerWalls}
            aboveFrame={up?.frame}
            aboveDims={up?.content.dimensions}
            aboveWalls={up?.content.outerWalls}
            slab={slab}
          />
        );
      })}
      <ActiveFloorGroup>{children}</ActiveFloorGroup>
    </>
  );
};
