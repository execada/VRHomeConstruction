/**
 * Дверь в проёме: коробка внутри проёма, наличники на гранях стены и полотна,
 * которые плавно поворачиваются на петлях при открывании и закрывании.
 * Размеры полотна вычисляются по проёму, поэтому дверь всегда стоит точно в нём.
 * Координаты — локальные координаты проёма (центр проёма, +z — сторона нормали стены).
 * @module editor-3d/ui/scene/DoorMesh
 */

import React, { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { DOOR_PARTS, doorLeaves, doorStyle, type DoorLeaf, type DoorLeafDesign, type DoorSpec } from '../../lib/doors';
import type { Opening } from '../../types';

const FRAME_COLOR = '#f2eee8';
const METAL = '#9a9ca0';
const GLASS = '#cfe3f0';
/** Скорость доводки угла (1/с): ~0,6 с на открывание. */
const SWING_RATE = 7;
const HIDE = { hideOnCut: true };

type V3 = [number, number, number];

/** Брусок (коробка, наличник, филёнка). */
const Part: React.FC<{ size: V3; pos: V3; color: string; metal?: boolean }> = ({ size, pos, color, metal }) => (
  <mesh position={pos} castShadow receiveShadow userData={HIDE}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={metal ? 0.3 : 0.55} metalness={metal ? 0.8 : 0} />
  </mesh>
);

/** Стекло (не отбрасывает тень — солнце проходит). */
const Glass: React.FC<{ size: [number, number]; pos: V3 }> = ({ size, pos }) => (
  <mesh position={pos} userData={HIDE}>
    <boxGeometry args={[size[0], size[1], 0.008]} />
    <meshStandardMaterial color={GLASS} transparent opacity={0.25} roughness={0.05} metalness={0.1} depthWrite={false} />
  </mesh>
);

/** Полотно заданного рисунка в системе петли: x — от петель к притвору, z — внутрь стены. */
function LeafBody({ design, w, h, color, dir, back }: { design: DoorLeafDesign; w: number; h: number; color: string; dir: number; back: number }) {
  const t = DOOR_PARTS.leaf;
  const cx = (dir * w) / 2;
  const z = back * (t / 2);
  if (design === 'flush') return <Part size={[w, h, t]} pos={[cx, h / 2, z]} color={color} />;
  if (design === 'panel') {
    const pw = w - 0.24;
    const panels: Array<[number, number]> = [[h * 0.66, h * 0.42], [h * 0.24, h * 0.3]];
    return (
      <>
        <Part size={[w, h, t]} pos={[cx, h / 2, z]} color={color} />
        {panels.flatMap(([y, ph]) =>
          [-1, 1].map((s) => <Part key={`${y}${s}`} size={[pw, ph, 0.008]} pos={[cx, y, z + s * (t / 2 + 0.004)]} color={color} />),
        )}
      </>
    );
  }
  const rail = design === 'glass' ? 0.045 : 0.11;
  const solid = design === 'glass' ? rail : h * 0.38;
  const frameColor = design === 'glass' ? METAL : color;
  return (
    <>
      <Part size={[w, solid, t]} pos={[cx, solid / 2, z]} color={frameColor} metal={design === 'glass'} />
      <Part size={[w, rail, t]} pos={[cx, h - rail / 2, z]} color={frameColor} metal={design === 'glass'} />
      {[rail / 2, w - rail / 2].map((x) => (
        <Part key={x} size={[rail, h - solid - rail, t]} pos={[dir * x, solid + (h - solid - rail) / 2, z]} color={frameColor} metal={design === 'glass'} />
      ))}
      <Glass size={[w - rail * 2, h - solid - rail]} pos={[cx, solid + (h - solid - rail) / 2, z]} />
    </>
  );
}

/** Нажимная ручка с обеих сторон полотна. */
const Handles: React.FC<{ x: number; z: number }> = ({ x, z }) => (
  <>
    {[-1, 1].map((s) => (
      <group key={s} position={[x, 1.0, z + s * (DOOR_PARTS.leaf / 2 + 0.012)]}>
        <Part size={[0.05, 0.05, 0.012]} pos={[0, 0, 0]} color={METAL} metal />
        <Part size={[0.12, 0.018, 0.018]} pos={[-Math.sign(x) * 0.05, 0, s * 0.03]} color={METAL} metal />
      </group>
    ))}
  </>
);

/** Створка на петлях: плавный поворот к открытому или закрытому положению. */
const LeafPivot: React.FC<{ leaf: DoorLeaf; door: DoorSpec; floor: number }> = ({ leaf, door, floor }) => {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = door.open ? leaf.openSign * DOOR_PARTS.openAngle : 0;
    const next = g.rotation.y + (target - g.rotation.y) * Math.min(1, delta * SWING_RATE);
    g.rotation.y = Math.abs(target - next) < 1e-4 ? target : next;
  });
  const back = leaf.hinge[1] >= 0 ? -1 : 1;
  const design = doorStyle(door.style).design;
  return (
    <group ref={ref} position={[leaf.hinge[0], floor, leaf.hinge[1]]}>
      <LeafBody design={design} w={leaf.width} h={leaf.height} color={door.color} dir={leaf.toLatch} back={back} />
      <Handles x={leaf.toLatch * (leaf.width - 0.07)} z={(back * DOOR_PARTS.leaf) / 2} />
    </group>
  );
};

/** Коробка в проёме и наличники на обеих гранях стены. */
const Frame: React.FC<{ w: number; h: number; t: number; casingTop: boolean }> = ({ w, h, t, casingTop }) => {
  const { frame: f, casing: c } = DOOR_PARTS;
  const lift = casingTop ? c - 0.01 : 0;
  return (
    <>
      {[-1, 1].map((s) => (
        <Part key={`j${s}`} size={[f, h, t]} pos={[s * (w / 2 - f / 2), 0, 0]} color={FRAME_COLOR} />
      ))}
      <Part size={[w - f * 2, f, t]} pos={[0, h / 2 - f / 2, 0]} color={FRAME_COLOR} />
      {[-1, 1].flatMap((side) => [
        ...[-1, 1].map((s) => (
          <Part key={`c${side}${s}`} size={[c, h + lift, 0.012]} pos={[s * (w / 2 + c / 2 - 0.01), lift / 2, side * (t / 2 + 0.006)]} color={FRAME_COLOR} />
        )),
        casingTop ? <Part key={`ct${side}`} size={[w + c * 2 - 0.02, c, 0.012]} pos={[0, h / 2 + c / 2 - 0.01, side * (t / 2 + 0.006)]} color={FRAME_COLOR} /> : null,
      ])}
    </>
  );
};

interface DoorMeshProps {
  opening: Opening;
  door: DoorSpec;
  /** Толщина стены */
  thickness: number;
  /** Высота стены (наличник над проёмом — только если помещается) */
  wallHeight: number;
}

/** Дверь в проёме (локальные координаты проёма: центр проёма). */
export const DoorMesh: React.FC<DoorMeshProps> = memo(({ opening, door, thickness, wallHeight }) => {
  const { width: w, height: h } = opening;
  const sill = opening.position[1] - h / 2;
  const casingTop = sill + h + DOOR_PARTS.casing <= wallHeight - 1e-3;
  return (
    <>
      <Frame w={w} h={h} t={thickness} casingTop={casingTop} />
      {doorLeaves(opening, door, thickness).map((leaf, i) => (
        <LeafPivot key={i} leaf={leaf} door={door} floor={-h / 2 + DOOR_PARTS.floorGap} />
      ))}
    </>
  );
});
