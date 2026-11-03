/**
 * Перетаскивание проёма по плоскости стены в 3D: вдоль стены и (для окон) по высоте.
 * Положение ограничивается краями стены, соседними проёмами и стыками (см. команды проёмов).
 * Касание без перетаскивания открывает или закрывает дверь: от первого лица и в VR — сразу,
 * в остальных режимах — если дверь уже выделена (первый клик выделяет, второй открывает).
 * @module editor-3d/ui/scene/useOpeningDrag
 */

import { useStore } from 'react-redux';
import { useXR } from '@react-three/xr';
import type { RootState } from '@/app/store';
import { selectors as cameraSelectors } from '@/features/camera/selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import type { WallFrame } from '../../lib/walls';
import type { Opening } from '../../types';
import { rayToWall } from './pointer';
import { useDragGesture, type DragHandlers } from './useDragGesture';

/** Смещение по стене, после которого касание считается перетаскиванием, м. */
const TAP_DISTANCE = 0.03;

interface OpeningDragContext {
  du: number;
  dv: number;
  start: { u: number; v: number };
  moved: boolean;
  wasSelected: boolean;
}

/**
 * @param hostId - сторона стены или id перегородки
 * @param frame - система координат стены (рабочая грань — плоскость перетаскивания)
 * @param opening - проём
 */
export function useOpeningDrag(hostId: string, frame: WallFrame, opening: Opening): DragHandlers {
  const commands = useSceneCommands();
  const store = useStore<RootState>();
  const inXR = useXR((s) => s.session != null);
  return useDragGesture<OpeningDragContext>({
    id: opening.id,
    onStart: (e) => {
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
      const firstPerson = cameraSelectors.selectCameraMode(store.getState()) === 'fps';
      if (firstPerson || inXR || ctx.wasSelected) commands.openings.toggleDoor(hostId, opening.id);
    },
  });
}
