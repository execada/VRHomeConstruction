/**
 * Лестница в 3D: дубовые проступи и площадка, белые подступёнки и тетивы, поручни
 * на стойках с обеих сторон марша и стеклянное ограждение выреза на этаже выше.
 * В режиме призрака (инструмент «Лестница») — полупрозрачная, красная, если не помещается.
 * @module editor-3d/ui/scene/stairs/StairMesh
 */

import React, { memo, useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { ExtrudeGeometry, MeshStandardMaterial, Shape, type Material } from 'three';
import { boxWithUv } from '@/features/textures/lib/uvGeometry';
import { useFinishMaterial } from '@/features/textures/model/useFinishMaterial';
import { STRINGER, stairParts, type StairBox } from '../../../lib/stairs/stairParts';
import { stringerProfile, type StairLayout } from '../../../lib/stairs/stairs';
import type { Stair, SurfaceFinish } from '../../../types';
import { HELPER_DATA, NO_RAYCAST, type SceneMouseEvent, type ScenePointerEvent } from '../pointer';

/** Обработчики указателя активной лестницы. */
export interface StairHandlers {
  onPointerDown?: (e: ScenePointerEvent) => void;
  onPointerMove?: (e: ScenePointerEvent) => void;
  onPointerUp?: (e: ScenePointerEvent) => void;
  onPointerCancel?: (e: ScenePointerEvent) => void;
  onClick?: (e: SceneMouseEvent) => void;
}

interface StairMeshProps {
  stair: Stair;
  layout: StairLayout;
  selected?: boolean;
  /** Призрак размещения: помещается — золотистый, нет — красный */
  ghost?: 'valid' | 'invalid' | null;
  handlers?: StairHandlers;
}

const OAK: SurfaceFinish = { textureId: 'wood_floor', color: '#e9d3b4', scale: 1 };
const SELECTED_COLOR = '#c9a96e';
const STRINGER_DEPTH = 0.32;

/** Материалы деталей лестницы (свои у каждой лестницы). */
function useStairMaterials(ghost: StairMeshProps['ghost']) {
  const oak = useFinishMaterial(OAK, 'floor');
  const materials = useMemo(() => {
    if (ghost) {
      const tint = new MeshStandardMaterial({ color: ghost === 'valid' ? '#c9a96e' : '#d9534f', transparent: true, opacity: 0.45, depthWrite: false });
      return { tread: tint, white: tint, metal: tint, glass: tint, owned: [tint] };
    }
    const white = new MeshStandardMaterial({ color: '#f1eee8', roughness: 0.55 });
    const metal = new MeshStandardMaterial({ color: '#2b2c2e', roughness: 0.35, metalness: 0.7 });
    const glass = new MeshStandardMaterial({ color: '#d3e3ea', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
    return { tread: oak.material as Material, white, metal, glass, owned: [white, metal, glass] };
  }, [ghost, oak.material]);
  useEffect(() => () => materials.owned.forEach((m) => m.dispose()), [materials]);
  return { ...materials, tile: oak.tile };
}

/** Тетива по профилю марша (выдавливание поперёк марша). */
function useStringer(layout: StairLayout): ExtrudeGeometry {
  const geometry = useMemo(() => {
    const points = stringerProfile(layout, STRINGER_DEPTH);
    const shape = new Shape();
    points.forEach(([t, h], i) => (i === 0 ? shape.moveTo(t, h) : shape.lineTo(t, h)));
    shape.closePath();
    return new ExtrudeGeometry(shape, { depth: STRINGER, bevelEnabled: false });
  }, [layout]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Детали призрака и стекло не перехватывают указатель (курсор «проходит» к полу и маршу). */
const raycastOf = (solid: boolean) => (solid ? undefined : NO_RAYCAST);

const Bars: React.FC<{ boxes: StairBox[]; material: Material; shadows: boolean; solid?: boolean }> = ({ boxes, material, shadows, solid = shadows }) => (
  <>
    {boxes.map((b, i) => (
      <mesh key={i} position={b.center} rotation={[b.tilt ?? 0, 0, 0]} material={material} castShadow={shadows} receiveShadow={shadows} raycast={raycastOf(solid)}>
        <boxGeometry args={b.size} />
      </mesh>
    ))}
  </>
);

/** Проступи с UV в метрах: древесина непрерывна вдоль марша. */
const Treads: React.FC<{ boxes: StairBox[]; material: Material; tile: number; shadows: boolean }> = ({ boxes, material, tile, shadows }) => {
  const geometries = useMemo(() => boxes.map((b) => boxWithUv(b.size, b.center, tile)), [boxes, tile]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} position={boxes[i].center} material={material} castShadow={shadows} receiveShadow={shadows} raycast={raycastOf(shadows)} />
      ))}
    </>
  );
};

export const StairMesh: React.FC<StairMeshProps> = memo(({ stair, layout, selected = false, ghost = null, handlers }) => {
  const parts = useMemo(() => stairParts(layout, stair.width), [layout, stair.width]);
  const m = useStairMaterials(ghost);
  const stringer = useStringer(layout);
  const shadows = !ghost;
  const half = stair.width / 2;
  return (
    <group position={[stair.position[0], 0, stair.position[1]]} rotation={[0, stair.rotation, 0]} userData={ghost ? HELPER_DATA : undefined}>
      <group {...handlers}>
        <Treads boxes={parts.treads} material={m.tread} tile={m.tile} shadows={shadows} />
        <Bars boxes={parts.risers} material={m.white} shadows={shadows} />
        {[-half, half - STRINGER].map((x) => (
          <mesh key={x} geometry={stringer} material={m.white} position={[x, 0, layout.length / 2]} rotation={[0, Math.PI / 2, 0]} castShadow={shadows} receiveShadow={shadows} raycast={raycastOf(shadows)} />
        ))}
        <Bars boxes={parts.posts} material={m.metal} shadows={shadows} />
        <Bars boxes={parts.rails} material={m.metal} shadows={shadows} />
        <Bars boxes={parts.glass} material={m.glass} shadows={false} solid={false} />
      </group>
      {selected && (
        <mesh position={[0, layout.rise / 2, 0]} raycast={NO_RAYCAST} userData={HELPER_DATA}>
          <boxGeometry args={[stair.width + 0.04, layout.rise + 0.04, layout.length + 0.04]} />
          <meshBasicMaterial visible={false} />
          <Edges color={SELECTED_COLOR} raycast={NO_RAYCAST} />
        </mesh>
      )}
    </group>
  );
});
