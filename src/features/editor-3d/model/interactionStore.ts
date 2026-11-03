/**
 * Состояние взаимодействия со сценой (вне Redux — меняется на каждый кадр):
 * перетаскивание, поворот, размещение новой модели («призрак»), привязка к сетке.
 * @module editor-3d/model/interactionStore
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import type { SnapKind } from '../lib/wallSnap';

/** Что сейчас делает пользователь. */
export type InteractionMode = 'idle' | 'dragging' | 'rotating' | 'placing';

/** Призрак размещаемой модели. */
export interface PlacementGhost {
  center: Vec2;
  angle: number;
  valid: boolean;
}

/** Черновик рисуемой внутренней стены. */
export interface WallDraft {
  /** Начало стены (null — ещё не поставлено) */
  start: Vec2 | null;
  /** Точка под курсором (с привязкой) */
  cursor: Vec2;
  /** К чему привязалась точка */
  snap: SnapKind;
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
  /** Идёт рисование стен: перетаскивание объектов отключено */
  drawingWalls: boolean;
  /** Черновик рисуемой стены */
  wallDraft: WallDraft | null;
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
  drawingWalls: false,
  wallDraft: null,
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
  /** Включить/выключить режим рисования стен (выключение сбрасывает черновик) */
  setDrawingWalls(drawingWalls: boolean) {
    interactionStore.setState(drawingWalls ? { drawingWalls } : { drawingWalls, wallDraft: null });
  },
  /** Обновить черновик рисуемой стены */
  setWallDraft(wallDraft: WallDraft | null) {
    interactionStore.setState({ wallDraft });
  },
};
