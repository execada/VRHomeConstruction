/**
 * Подсказки подвеса: пока размещается или перетаскивается настенный предмет, стена, на которую он
 * повиснет, подсвечена целиком, а его место на ней — ярче; у потолочного предмета подсвечен
 * потолок над ним. Если повесить нельзя (стены рядом нет, нет места) — место красное.
 * Площадки — вспомогательные объекты редактора: не перехватывают указатель и не попадают в превью.
 * @module editor-3d/ui/scene/MountHints
 */

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Edges } from '@react-three/drei';
import { DoubleSide } from 'three';
import { useExternalStore } from '@/shared/lib/externalStore';
import type { FurnitureItem } from '@/features/furniture/types';
import { selectors as editorSelectors } from '../../selectors';
import { interactionStore } from '../../model/interactionStore';
import { attachOf } from '../../lib/attachRole';
import { itemSizes } from '../../lib/placement';
import { wallFaces, WALL_GAP, type WallFace } from '../../lib/wallMount';
import { wallToWorld } from '../../lib/walls';
import { HELPER_DATA, NO_RAYCAST } from './pointer';
import { DRAFT_ID, useHintSubject } from './useHintSubject';

const VALID_COLOR = '#3b8beb';
const INVALID_COLOR = '#e5484d';
/** Площадка над стеной или под потолком, чтобы не мерцала вместе с ними, м. */
const LIFT = 0.003;
/** Запас площадки на потолке вокруг предмета, м. */
const CEILING_MARGIN = 0.25;

/** Где висит предмет: призрак размещаемой модели или сам перетаскиваемый предмет. */
interface HangingPose {
  center: readonly [number, number];
  angle: number;
  elevation: number;
  valid: boolean;
  mount: string | null;
}

function useHangingPose(subject: FurnitureItem | null): HangingPose | null {
  const ghost = useExternalStore(interactionStore, (s) => s.ghost);
  if (!subject) return null;
  if (subject.id === DRAFT_ID) return ghost ? { ...ghost, mount: ghost.mount ?? null } : null;
  return { center: [subject.position[0], subject.position[2]], angle: subject.rotation[1], elevation: subject.position[1], valid: true, mount: subject.mount ?? null };
}

const Plate: React.FC<{ position: [number, number, number]; rotation: [number, number, number]; size: [number, number]; color: string; opacity: number }> = ({
  position,
  rotation,
  size,
  color,
  opacity,
}) => (
  <mesh position={position} rotation={rotation} raycast={NO_RAYCAST} renderOrder={2}>
    <planeGeometry args={size} />
    <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} side={DoubleSide} />
    <Edges color={color} transparent opacity={Math.min(1, opacity * 2.5)} raycast={NO_RAYCAST} />
  </mesh>
);

/** Стена целиком и место предмета на ней. */
const WallHint: React.FC<{ face: WallFace; item: FurnitureItem; pose: HangingPose }> = ({ face, item, pose }) => {
  const sizes = itemSizes(item);
  const color = pose.valid ? VALID_COLOR : INVALID_COLOR;
  const middle = wallToWorld(face.frame, 0, face.frame.height / 2, LIFT);
  const local = (pose.center[0] - face.frame.origin[0]) * face.frame.tangent[0] + (pose.center[1] - face.frame.origin[1]) * face.frame.tangent[1];
  const spot = wallToWorld(face.frame, local, pose.elevation + sizes.height / 2, LIFT * 2);
  const rotation: [number, number, number] = [0, face.frame.rotationY, 0];
  return (
    <>
      <Plate position={middle} rotation={rotation} size={[face.frame.length, face.frame.height]} color={color} opacity={0.14} />
      <Plate position={spot} rotation={rotation} size={[sizes.halfWidth * 2 + WALL_GAP * 4, sizes.height + WALL_GAP * 4]} color={color} opacity={0.3} />
    </>
  );
};

/** Потолок над потолочным предметом. */
const CeilingHint: React.FC<{ item: FurnitureItem; pose: HangingPose; ceiling: number }> = ({ item, pose, ceiling }) => {
  const sizes = itemSizes(item);
  return (
    <Plate
      position={[pose.center[0], ceiling - LIFT, pose.center[1]]}
      rotation={[Math.PI / 2, 0, -pose.angle]}
      size={[sizes.halfWidth * 2 + CEILING_MARGIN * 2, sizes.halfDepth * 2 + CEILING_MARGIN * 2]}
      color={pose.valid ? VALID_COLOR : INVALID_COLOR}
      opacity={0.25}
    />
  );
};

export const MountHints: React.FC = () => {
  const subject = useHintSubject();
  const pose = useHangingPose(subject);
  const dimensions = useSelector(editorSelectors.selectDimensions);
  const partitions = useSelector(editorSelectors.selectPartitions);
  const openings = useSelector(editorSelectors.selectOpenings);
  const removedWalls = useSelector(editorSelectors.selectRemovedWalls);
  const faces = useMemo(() => wallFaces({ dimensions, partitions, openings, removedWalls }), [dimensions, partitions, openings, removedWalls]);
  if (!subject || !pose) return null;
  const attach = attachOf(subject);
  const face = attach === 'wall' ? faces.find((f) => f.frame.id === pose.mount) : undefined;
  return (
    <group userData={HELPER_DATA}>
      {face && <WallHint face={face} item={subject} pose={pose} />}
      {attach === 'ceiling' && <CeilingHint item={subject} pose={pose} ceiling={dimensions.height} />}
    </group>
  );
};
