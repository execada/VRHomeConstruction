/**
 * Состояние взаимодействия со сценой (вне Redux — меняется на каждый кадр):
 * перетаскивание, поворот, размещение новой модели («призрак»), привязка к сетке.
 * @module editor-3d/model/interactionStore
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { Vec2 } from '@/shared/lib/math/geometry2d';

/** Что сейчас делает пользователь. */
export type InteractionMode = 'idle' | 'dragging' | 'rotating' | 'placing';

/** Призрак размещаемой модели. */
export interface PlacementGhost {
  center: Vec2;
  angle: number;
  valid: boolean;
  /** Высота низа призрака: 0 — пол, иначе высота поверхности опоры */
  elevation: number;
  /** Опора, на поверхности которой стоит призрак (null — пол) */
  supportId: string | null;
}

export interface InteractionState {
  mode: InteractionMode;
  /** id перетаскиваемого/поворачиваемого объекта */
  activeId: string | null;
  /** Путь модели, которую размещаем */
  placingPath: string | null;
  /** Название размещаемой модели */
  placingName: string | null;
  /** Поворот, заданный пользователем клавишей R (null — автоповорот у стен) */
  placingAngle: number | null;
  ghost: PlacementGhost | null;
  /** Привязка к сетке */
  gridEnabled: boolean;
  /** Номер текущего (последнего) жеста — история склеивает изменения внутри одного жеста */
  gestureId: number;
}

/** Шаг сетки, м. */
export const GRID_STEP = 0.1;
/** Радиус магнита к стенам, м. */
export const WALL_MAGNET = 0.12;
/** MIME-тип перетаскиваемой из каталога модели (HTML5 drag & drop). */
export const MODEL_DRAG_TYPE = 'application/x-vrhc-model';
/** Шаг поворота клавишами, рад (15°). */
export const ROTATE_STEP = Math.PI / 12;

const initialState: InteractionState = {
  mode: 'idle',
  activeId: null,
  placingPath: null,
  placingName: null,
  placingAngle: null,
  ghost: null,
  gridEnabled: false,
  gestureId: 0,
};

export const interactionStore = createExternalStore<InteractionState>(initialState);

/** Операции над состоянием взаимодействия. */
export const interaction = {
  /** Начать размещение модели из каталога */
  startPlacing(path: string, name: string) {
    interactionStore.setState({ mode: 'placing', placingPath: path, placingName: name, placingAngle: null, ghost: null, activeId: null });
  },
  /** Начать перетаскивание или поворот объекта */
  startGesture(mode: 'dragging' | 'rotating', id: string) {
    interactionStore.setState((s) => ({ mode, activeId: id, gestureId: s.gestureId + 1 }));
  },
  /** Обновить призрак размещения */
  setGhost(ghost: PlacementGhost | null) {
    interactionStore.setState({ ghost });
  },
  /** Повернуть призрак на шаг */
  rotatePlacing(delta: number) {
    interactionStore.setState((s) => ({ placingAngle: (s.placingAngle ?? s.ghost?.angle ?? 0) + delta }));
  },
  /** Закончить жест или размещение */
  reset() {
    interactionStore.setState({ mode: 'idle', activeId: null, placingPath: null, placingName: null, placingAngle: null, ghost: null });
  },
  /** Переключить привязку к сетке */
  toggleGrid() {
    interactionStore.setState((s) => ({ gridEnabled: !s.gridEnabled }));
  },
};
