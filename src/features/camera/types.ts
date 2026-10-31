/**
 * Типы фичи камеры.
 * @module camera/types
 */

/**
 * Режим камеры:
 * orbit — облёт комнаты, fps — от первого лица, top — план сверху, fixed — фиксированный вид.
 */
export type CameraMode = 'orbit' | 'fps' | 'top' | 'fixed';

/** Фиксированные виды: изометрия и виды на комнату с каждой стороны. */
export type FixedView = 'iso' | 'front' | 'back' | 'left' | 'right';

/** Состояние камеры (Redux slice, сохраняется в localStorage). */
export interface CameraState {
  mode: CameraMode;
  fixedView: FixedView;
  /** Столкновения со стенами и мебелью в режиме от первого лица */
  collisions: boolean;
  /** Счётчик запросов перехода к виду (повторный выбор того же вида тоже срабатывает) */
  viewRequest: number;
}
