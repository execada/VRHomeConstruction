/**
 * Перекрытия этажа: чистовой пол (сверху — отделка пола, с вырезами под лестницы снизу)
 * и плита над этажом (снизу — потолок, сверху — крыша или терраса, с вырезами под свои
 * лестницы). Торцы плит — бетон: они видны по фасаду между этажами и в проёме лестницы.
 * У активного этажа клик по полу и потолку выделяет поверхность, а потолок срезается,
 * когда камера выше него. Материалы — свои у каждого этажа (срез меняет их состояние).
 * @module editor-3d/ui/scene/building/FloorSlabs
 */

import React, { memo, useEffect, useMemo } from 'react';
import { MeshStandardMaterial, type Group, type Material } from 'three';
import { boxWithUv } from '@/features/textures/lib/uvGeometry';
import { useFinishMaterial } from '@/features/textures/model/useFinishMaterial';
import type { Rect } from '@/shared/lib/math/geometry2d';
import type { FloorSlabs as FloorSlabsData, SlabLayer } from '../../../lib/building/slabs';
import type { RoomFinishes } from '../../../types';
import { useCutaway } from '../cutaway';
import type { SceneMouseEvent } from '../pointer';

const EDGE_COLOR = '#d6d1c8';
const ROOF_COLOR = '#bdb7ac';
/** Размер «плитки» крыши для UV, м. */
const ROOF_TILE = 1;

/** Свой материал на каждый слой: срез меняет состояние материала. */
function useSolid(color: string, roughness: number): MeshStandardMaterial {
  const material = useMemo(() => new MeshStandardMaterial({ color, roughness, metalness: 0 }), [color, roughness]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/** Куски слоя: геометрии боксов с UV в метрах (текстура непрерывна по всем кускам). */
function useLayerParts(layer: SlabLayer, tile: number, topTile: number) {
  const parts = useMemo(
    () =>
      layer.rects.map((r: Rect) => {
        const center: [number, number, number] = [(r.minX + r.maxX) / 2, (layer.bottom + layer.top) / 2, (r.minZ + r.maxZ) / 2];
        const size: [number, number, number] = [r.maxX - r.minX, layer.top - layer.bottom, r.maxZ - r.minZ];
        return { key: `${r.minX.toFixed(3)}_${r.minZ.toFixed(3)}`, center, geometry: boxWithUv(size, center, tile, topTile) };
      }),
    [layer, tile, topTile],
  );
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return parts;
}

const Layer: React.FC<{
  layer: SlabLayer;
  materials: Material[];
  tile: number;
  topTile: number;
  castShadow: boolean;
  onClick?: (e: SceneMouseEvent) => void;
}> = ({ layer, materials, tile, topTile, castShadow, onClick }) => {
  const parts = useLayerParts(layer, tile, topTile);
  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} geometry={p.geometry} position={p.center} material={materials} receiveShadow castShadow={castShadow} onClick={onClick} />
      ))}
    </>
  );
};

interface FloorSlabsProps {
  slabs: FloorSlabsData;
  finishes: RoomFinishes;
  /** Высота этажа (для среза потолка) */
  height: number;
  /** Срезать плиту над этажом, когда камера выше потолка */
  cutCeiling: boolean;
  onFloorClick?: (e: SceneMouseEvent) => void;
  onCeilingClick?: (e: SceneMouseEvent) => void;
}

export const FloorSlabs: React.FC<FloorSlabsProps> = memo(({ slabs, finishes, height, cutCeiling, onFloorClick, onCeilingClick }) => {
  const floor = useFinishMaterial(finishes.floor, 'floor');
  const ceiling = useFinishMaterial(finishes.ceiling, 'ceiling');
  const floorEdge = useSolid(EDGE_COLOR, 0.9);
  const ceilingEdge = useSolid(EDGE_COLOR, 0.9);
  const roof = useSolid(ROOF_COLOR, 0.95);
  const floorMaterials = useMemo(() => [floorEdge, floorEdge, floor.material, floorEdge, floorEdge, floorEdge], [floorEdge, floor.material]);
  const ceilingMaterials = useMemo(
    () => [ceilingEdge, ceilingEdge, roof, ceiling.material, ceilingEdge, ceilingEdge],
    [ceilingEdge, roof, ceiling.material],
  );
  const shouldCut = useMemo(
    () => (cutCeiling ? (camera: { position: { y: number } }) => camera.position.y > height - 0.05 : null),
    [cutCeiling, height],
  );
  const ceilingRef = useCutaway<Group>(shouldCut);
  return (
    <group>
      <Layer layer={slabs.floor} materials={floorMaterials} tile={floor.tile} topTile={floor.tile} castShadow={false} onClick={onFloorClick} />
      <group ref={ceilingRef}>
        <Layer layer={slabs.ceiling} materials={ceilingMaterials} tile={ceiling.tile} topTile={ROOF_TILE} castShadow onClick={onCeilingClick} />
      </group>
    </group>
  );
});
