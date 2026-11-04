/**
 * Перетаскивание проёма по плоскости стены в 3D: вдоль стены и (для окон) по высоте.
 * Положение ограничивается краями стены, соседними проёмами и стыками (см. команды проёмов).
 * Касание без перетаскивания открывает или закрывает дверь: в VR — сразу, в облёте, на плане
 * и фиксированных видах — если дверь уже выделена (первый клик выделяет, второй открывает).
 * От первого лица проём не перетаскивается (зажатая кнопка — осмотр): клик выделяет его
 * и сразу открывает или закрывает дверь.
 * @module editor-3d/ui/scene/useOpeningDrag
 */

import { useCallback, useMemo } from 'react';
import { useStore } from 'react-redux';
import { useXR } from '@react-three/xr';
import type { RootState } from '@/app/store';
import { isPointerBusy } from '../../model/interactionStore';
import { useSceneCommands } from '../../model/useSceneCommands';
import type { WallFrame } from '../../lib/walls';
import type { Opening } from '../../types';
import { isClick, rayToWall, type SceneMouseEvent } from './pointer';
import { useDragGesture, type DragHandlers } from './useDragGesture';
import { useWalkingCheck } from './useWalkingCheck';

/** Смещение по стене, после которого касание считается перетаскиванием, м. */
const TAP_DISTANCE = 0.03;

interface OpeningDragContext {
  du: number;
  dv: number;
  start: { u: number; v: number };
  moved: boolean;
  wasSelected: boolean;
}

/** Обработчики указателя проёма: перетаскивание и клик (от первого лица). */
export interface OpeningPointerHandlers extends DragHandlers {
  onClick: (e: SceneMouseEvent) => void;
}

/**
 * @param hostId - сторона стены или id перегородки
 * @param frame - система координат стены (рабочая грань — плоскость перетаскивания)
 * @param opening - проём
 */
export function useOpeningDrag(hostId: string, frame: WallFrame, opening: Opening): OpeningPointerHandlers {
  const commands = useSceneCommands();
  const store = useStore<RootState>();
  const inXR = useXR((s) => s.session != null);
  const isWalking = useWalkingCheck();
  const drag = useDragGesture<OpeningDragContext>({
    id: opening.id,
    onStart: (e) => {
      if (isWalking()) return null;
      const sel = store.getState().selection.current;
      const wasSelected = sel?.kind === 'opening' && sel.id === opening.id;
      commands.select({ kind: 'opening', hostId, id: opening.id });
      const hit = rayToWall(e.ray, frame);
      return hit ? { du: opening.position[0] - hit.u, dv: opening.position[1] - hit.v, start: hit, moved: false, wasSelected } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToWall(e.ray, frame);
      if (!hit) return;
      if (!ctx.moved && Math.hypot(hit.u - ctx.start.u, hit.v - ctx.start.v) < TAP_DISTANCE) return;
      ctx.moved = true;
      commands.openings.move(hostId, opening.id, { u: hit.u + ctx.du, y: hit.v + ctx.dv });
    },
    onEnd: (ctx) => {
      if (ctx.moved || !opening.door) return;
      if (inXR || ctx.wasSelected) commands.openings.toggleDoor(hostId, opening.id);
    },
  });

  const isDoor = opening.door != null;
  const onClick = useCallback(
    (e: SceneMouseEvent) => {
      if (!isWalking() || isPointerBusy() || !isClick(e)) return;
      e.stopPropagation();
      commands.select({ kind: 'opening', hostId, id: opening.id });
      if (isDoor) commands.openings.toggleDoor(hostId, opening.id);
    },
    [commands, hostId, opening.id, isDoor, isWalking],
  );
  return useMemo(() => ({ ...drag, onClick }), [drag, onClick]);
}
