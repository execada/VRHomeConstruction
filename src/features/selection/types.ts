/**
 * Типы фичи выделения объектов сцены.
 * @module selection/types
 */

import type { WallSide } from '@/features/editor-3d/types';

/** Что выделено в сцене (одновременно — один объект). */
export type SceneSelection =
  | { kind: 'furniture'; id: string }
  | { kind: 'partition'; id: string }
  | { kind: 'stair'; id: string }
  /** hostId — сторона внешней стены или id перегородки */
  | { kind: 'opening'; hostId: string; id: string }
  | { kind: 'wall'; side: WallSide }
  | { kind: 'floor' }
  | { kind: 'ceiling' }
  /** Помещение, в котором находится точка [x, z] (помещения вычисляются по стенам) */
  | { kind: 'room'; point: [number, number] };

/** Состояние выделения (Redux slice). */
export interface SelectionState {
  current: SceneSelection | null;
  /** id объекта под курсором (подсветка) */
  hoveredId: string | null;
}
