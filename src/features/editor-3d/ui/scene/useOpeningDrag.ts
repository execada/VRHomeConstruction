/**
 * Перетаскивание проёма по плоскости стены в 3D: вдоль стены и (для окон) по высоте.
 * Положение ограничивается краями стены и соседними проёмами (см. команды проёмов).
 * @module editor-3d/ui/scene/useOpeningDrag
 */

import { useSceneCommands } from '../../model/useSceneCommands';
import type { WallFrame } from '../../lib/walls';
import type { Opening } from '../../types';
import { rayToWall } from './pointer';
import { useDragGesture, type DragHandlers } from './useDragGesture';

/**
 * @param hostId - сторона стены или id перегородки
 * @param frame - система координат стены (рабочая грань — плоскость перетаскивания)
 * @param opening - проём
 */
export function useOpeningDrag(hostId: string, frame: WallFrame, opening: Opening): DragHandlers {
  const commands = useSceneCommands();
  return useDragGesture<{ du: number; dv: number }>({
    id: opening.id,
    onStart: (e) => {
      commands.select({ kind: 'opening', hostId, id: opening.id });
      const hit = rayToWall(e.ray, frame);
      return hit ? { du: opening.position[0] - hit.u, dv: opening.position[1] - hit.v } : null;
    },
    onMove: (e, ctx) => {
      const hit = rayToWall(e.ray, frame);
      if (hit) commands.openings.move(hostId, opening.id, { u: hit.u + ctx.du, y: hit.v + ctx.dv });
    },
  });
}
