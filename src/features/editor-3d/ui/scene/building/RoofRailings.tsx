/**
 * Ограждение крыши и террас: стеклянный парапет с бетонным бортиком и металлическим
 * поручнем по открытым краям плиты над этажом — там, где над ней нет этажа выше.
 * Высота совпадает с препятствием для хождения (см. lib/building/walk).
 * @module editor-3d/ui/scene/building/RoofRailings
 */

import React, { memo, useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { roofLevel, type FloorFrame } from '../../../lib/building/floors';
import { roofEdges } from '../../../lib/building/slabs';
import { ROOF_RAIL_HEIGHT } from '../../../lib/building/walk';
import type { OuterWalls, RoomDimensions } from '../../../types';
import { NO_RAYCAST } from '../pointer';

const CURB = 0.1;
const RAIL = 0.05;
/** Отступ ограждения внутрь от края плиты, м. */
const INSET = 0.06;

interface RoofRailingsProps {
  frame: FloorFrame;
  dims: RoomDimensions;
  outerWalls: OuterWalls;
  /** Этаж выше (нет — крыша верхнего этажа): его положение, размеры и стены */
  aboveFrame?: FloorFrame;
  aboveDims?: RoomDimensions;
  aboveWalls?: OuterWalls;
  slab: number;
}

/** Материалы ограждения (общие для всех отрезков этажа). */
function useRailMaterials() {
  const materials = useMemo(
    () => ({
      curb: new MeshStandardMaterial({ color: '#c9c4bb', roughness: 0.9 }),
      glass: new MeshStandardMaterial({ color: '#d3e3ea', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.2, depthWrite: false }),
      rail: new MeshStandardMaterial({ color: '#b9bfc6', roughness: 0.3, metalness: 0.85 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  return materials;
}

export const RoofRailings: React.FC<RoofRailingsProps> = memo(({ frame, dims, outerWalls, aboveFrame, aboveDims, aboveWalls, slab }) => {
  const m = useRailMaterials();
  const level = roofLevel(frame, slab) - frame.base;
  const segments = useMemo(() => {
    const cx = 0;
    const upper = aboveFrame && aboveDims && aboveWalls ? { frame: aboveFrame, content: { dimensions: aboveDims, outerWalls: aboveWalls, stairs: [] } } : null;
    return roofEdges({ frame, content: { dimensions: dims, outerWalls, stairs: [] } }, upper).map((e) => {
      const alongX = Math.abs(e.b[1] - e.a[1]) < 1e-9;
      const length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const mid: [number, number] = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      // Сдвиг внутрь плиты: к центру этажа по нормали к отрезку
      const inward = alongX ? Math.sign(cx - mid[1]) || 1 : Math.sign(cx - mid[0]) || 1;
      const center: [number, number] = alongX ? [mid[0], mid[1] + inward * INSET] : [mid[0] + inward * INSET, mid[1]];
      return { key: `${e.a[0].toFixed(3)}_${e.a[1].toFixed(3)}_${e.b[0].toFixed(3)}`, center, length, rotation: alongX ? 0 : Math.PI / 2 };
    });
  }, [frame, dims, outerWalls, aboveFrame, aboveDims, aboveWalls]);
  return (
    <group position={[frame.offset[0], frame.base + level, frame.offset[1]]}>
      {segments.map((s) => (
        <group key={s.key} position={[s.center[0], 0, s.center[1]]} rotation={[0, s.rotation, 0]}>
          <mesh position={[0, CURB / 2, 0]} material={m.curb} castShadow receiveShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, CURB, 0.14]} />
          </mesh>
          <mesh position={[0, CURB + (ROOF_RAIL_HEIGHT - CURB - RAIL) / 2, 0]} material={m.glass} raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, ROOF_RAIL_HEIGHT - CURB - RAIL, 0.02]} />
          </mesh>
          <mesh position={[0, ROOF_RAIL_HEIGHT - RAIL / 2, 0]} material={m.rail} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[s.length, RAIL, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
