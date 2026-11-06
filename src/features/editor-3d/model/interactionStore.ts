/**
 * Состояние взаимодействия со сценой (вне Redux — меняется на каждый кадр):
 * перетаскивание, поворот, размещение новой модели («призрак»), привязка к сетке.
 * @module editor-3d/model/interactionStore
 */

import { createExternalStore } from '@/shared/lib/externalStore';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import type { StairPlacement } from '../lib/stairs/stairPlacement';
import type { SnapKind } from '../lib/wallSnap';
import type { StairKind } from '../types';

/** Что сейчас делает пользователь. */
export type InteractionMode = 'idle' | 'dragging' | 'rotating' | 'placing';

/** Призрак размещаемой модели. */
export interface PlacementGhost {
  center: Vec2;
  angle: number;
  valid: boolean;
  /** Высота низа призрака: 0 — пол, иначе высота поверхности опоры */
  elevation: number;
  /** Опора, на поверхности которой стоит призрак (null — пол); у подушки — диван или кресло */
  supportId: string | null;
  /** Посадочное место дивана или кресла, в которое сядет подушка */
  socket?: string | null;
  /** Наклон призрака назад (подушка у спинки или лёжа на сиденье), рад */
  tilt?: number;
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
  /** Какую лестницу ставит инструмент «Лестница» */
  stairKind: StairKind;
  /** Поворот, заданный клавишей R (null — вдоль ближайшей стены) */
  stairAngle: number | null;
  /** Призрак лестницы под курсором */
  stairGhost: StairPlacement | null;
  /** Инструмент «Лестница» активен: перетаскивание объектов отключено */
  placingStair: boolean;
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
  stairKind: 'straight',
  stairAngle: null,
  stairGhost: null,
  placingStair: false,
};

export const interactionStore = createExternalStore<InteractionState>(initialState);

/** Куда целится призрак: опора (или пол), высота её поверхности и посадочное место подушки. */
export function ghostAim(ghost: PlacementGhost | null): { supportId?: string | null; elevation?: number; socket?: string | null } {
  return ghost ? { supportId: ghost.supportId, elevation: ghost.elevation, socket: ghost.socket ?? null } : {};
}

/** Идёт размещение модели или лестницы, рисование стен: объекты сцены не перехватывают указатель. */
export function isPointerBusy(state: InteractionState = interactionStore.getState()): boolean {
  return state.mode === 'placing' || state.drawingWalls || state.placingStair;
}

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
  /** Выбрать лестницу для инструмента «Лестница» (поворот — снова вдоль стены) */
  chooseStair(stairKind: StairKind) {
    interactionStore.setState({ stairKind, stairAngle: null, stairGhost: null });
  },
  /** Включить/выключить инструмент «Лестница» (выключение убирает призрак) */
  setPlacingStair(placingStair: boolean) {
    interactionStore.setState(placingStair ? { placingStair } : { placingStair, stairGhost: null, stairAngle: null });
  },
  /** Призрак лестницы под курсором */
  setStairGhost(stairGhost: StairPlacement | null) {
    interactionStore.setState({ stairGhost });
  },
  /** Повернуть призрак лестницы */
  rotateStair(delta: number) {
    interactionStore.setState((s) => ({ stairAngle: (s.stairAngle ?? s.stairGhost?.stair.rotation ?? 0) + delta }));
  },
};
