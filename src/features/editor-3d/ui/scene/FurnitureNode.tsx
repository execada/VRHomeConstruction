/**
 * Предмет мебели в сцене: нормализованная модель, перетаскивание по полу и по поверхностям
 * опор (луч указателя или контроллера VR выбирает столешницу или полку), кольцо поворота
 * и рамка выделения. Все ограничения (стены, перегородки, другая мебель, края поверхностей,
 * сетка, магнит к стенам) применяют команды сцены. Опоры измеряют свои поверхности по мешам.
 * @module editor-3d/ui/scene/FurnitureNode
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Edges } from '@react-three/drei';
import { actions as furnitureActions } from '@/features/furniture/slice';
import { NormalizedModel } from '@/features/furniture/ui/NormalizedModel';
import type { ModelSizes } from '@/features/furniture/lib/modelLook';
import type { FurnitureItem } from '@/features/furniture/types';
import { add2, snapAngle, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { useSceneCommands } from '../../model/useSceneCommands';
import { interactionStore, ROTATE_STEP } from '../../model/interactionStore';
import { itemSizes } from '../../lib/placement';
import { furnitureRole } from '../../lib/supportRole';
import { HELPER_DATA, NO_RAYCAST, rayToFloor, toRay3 } from './pointer';
import { useDragGesture } from './useDragGesture';

const SELECTED_COLOR = '#c9a96e';
const LOCKED_COLOR = '#8a9a6b';

interface FurnitureNodeProps {
  item: FurnitureItem;
  selected: boolean;
}

/** Угол направления на полу в соглашении поворотов three.js. */
const headingOf = (v: Vec2) => Math.atan2(-v[1], v[0]);

/** Кольцо поворота вокруг основания выделенного предмета. */
const RotateRing: React.FC<{ item: FurnitureItem; radius: number }> = ({ item, radius }) => {
  const commands = useSceneCommands();
  const center: Vec2 = [item.position[0], item.position[2]];
  const handlers = useDragGesture<{ start: number; base: number }>({
    id: item.id,
    mode: 'rotating',
    onStart: (e) => {
      const hit = rayToFloor(e.ray, item.position[1]);
      return hit && !item.locked ? { start: headingOf(sub2(hit, center)), base: item.rotation[1] } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToFloor(e.ray, item.position[1]);
      if (!hit) return;
      const raw = ctx.base + headingOf(sub2(hit, center)) - ctx.start;
      commands.furniture.rotate(item.id, e.shiftKey ? raw : snapAngle(raw, ROTATE_STEP));
    },
  });
  return (
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={HELPER_DATA} {...handlers}>
      <ringGeometry args={[radius, radius + 0.07, 64]} />
      <meshBasicMaterial color={item.locked ? LOCKED_COLOR : SELECTED_COLOR} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

export const FurnitureNode: React.FC<FurnitureNodeProps> = memo(({ item, selected }) => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const [hovered, setHovered] = useState(false);
  const sizes = itemSizes(item);
  const isSupport = furnitureRole(item) === 'support';
  const look = useMemo(() => (item.color ? { tint: item.color } : undefined), [item.color]);

  useEffect(() => {
    if (!hovered) return undefined;
    document.body.style.cursor = item.locked ? 'not-allowed' : 'grab';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, item.locked]);

  const onMeasured = useCallback(
    (measured: ModelSizes) => {
      const same =
        Math.abs((item.halfWidth ?? 0) - measured.halfWidth) < 1e-4 &&
        Math.abs((item.halfDepth ?? 0) - measured.halfDepth) < 1e-4 &&
        Math.abs((item.height ?? 0) - measured.height) < 1e-4;
      if (!same) dispatch(furnitureActions.updateFurnitureSizes({ itemId: item.id, sizes: measured }));
    },
    [dispatch, item.id, item.halfWidth, item.halfDepth, item.height],
  );

  // Тянем в горизонтальной плоскости на высоте точки захвата над низом предмета: схваченная
  // точка остаётся под курсором (без параллакса), даже когда предмет переходит со стола на пол.
  // Луч указателя (или контроллера VR) выбирает поверхность опоры, на которую смотрит пользователь.
  const drag = useDragGesture<{ offset: Vec2; lift: number }>({
    id: item.id,
    onStart: (e) => {
      commands.select({ kind: 'furniture', id: item.id });
      if (item.locked) return null;
      const hit = rayToFloor(e.ray, e.point.y);
      return hit ? { offset: sub2([item.position[0], item.position[2]], hit), lift: e.point.y - item.position[1] } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToFloor(e.ray, item.position[1] + ctx.lift);
      if (hit) commands.furniture.move(item.id, add2(hit, ctx.offset), { ray: toRay3(e.ray), offset: ctx.offset });
    },
  });

  const ringRadius = Math.max(sizes.halfWidth, sizes.halfDepth) + 0.18;

  return (
    <group position={item.position} rotation={[0, item.rotation[1], 0]}>
      <group
        {...drag}
        onPointerOver={(e) => {
          // Пока размещается модель из каталога, мебель не перехватывает указатель: иначе R3F
          // не передаёт движение плоскости размещения и призрак не встаёт на столешницы и полки.
          if (interactionStore.getState().mode === 'placing') return;
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          // Клик по предмету не «проваливается» к полу или стене за ним (иначе выделение
          // переходило на них). При размещении из каталога клик нужен плоскости размещения.
          if (interactionStore.getState().mode !== 'placing') e.stopPropagation();
        }}
      >
        <group scale={item.scale}>
          <NormalizedModel path={item.modelPath} look={look} onMeasured={onMeasured} measureSurfaces={isSupport} />
        </group>
      </group>
      {(selected || hovered) && (
        <mesh position={[0, sizes.height / 2, 0]} raycast={NO_RAYCAST} userData={HELPER_DATA}>
          <boxGeometry args={[sizes.halfWidth * 2 + 0.02, sizes.height + 0.02, sizes.halfDepth * 2 + 0.02]} />
          <meshBasicMaterial visible={false} />
          <Edges color={item.locked ? LOCKED_COLOR : SELECTED_COLOR} transparent opacity={selected ? 1 : 0.45} raycast={NO_RAYCAST} />
        </mesh>
      )}
      {selected && <RotateRing item={item} radius={ringRadius} />}
    </group>
  );
});
