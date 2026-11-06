/**
 * Типы фичи камеры.
 * @module camera/types
 */

/**
 * Режим камеры: orbit — облёт активного этажа, fps — от первого лица, top — план сверху,
 * fixed — фиксированный вид, street — облёт здания снаружи (все этажи, без срезов).
 */
export type CameraMode = 'orbit' | 'fps' | 'top' | 'fixed' | 'street';

/** Все режимы камеры (проверка сохранённых настроек и позы). */
export const CAMERA_MODES = ['orbit', 'fps', 'top', 'fixed', 'street'] as const;

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
