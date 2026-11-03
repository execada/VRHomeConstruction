/**
 * Типы и интерфейсы для редактора 3D-сцены.
 * Включает описание проёмов, стен, отделки, состояния редактора, инструментов и освещения.
 *
 * Система координат: пол — плоскость y = 0, комната центрирована в начале координат,
 * внутреннее пространство x ∈ [−width/2, width/2], z ∈ [−depth/2, depth/2].
 * Внешние стены стоят снаружи этого прямоугольника.
 * @module editor-3d/types
 */

import type { WallMaterialId } from './lib/wallMaterials';

export type { WallMaterialId };

/** Внутренние размеры комнаты, м. */
export interface RoomDimensions {
  width: number;
  height: number;
  depth: number;
}

/** Сторона внешней стены комнаты (если смотреть сверху: front — +Z, back — −Z). */
export type WallSide = 'front' | 'back' | 'left' | 'right';

/**
 * Проём (окно или дверь) на стене или перегородке.
 */
export interface Opening {
  /** Уникальный идентификатор */
  id: string;
  /** Идентификатор стены (`front` | `back` | `left` | `right`) или перегородки, к которой привязан проём */
  wallId: string;
  /** Тип проёма: окно или дверь */
  type: 'window' | 'door';
  /**
   * Позиция центра проёма [u, y]:
   * u — смещение вдоль стены от её середины (вправо, если смотреть изнутри комнаты),
   * y — высота центра проёма над полом.
   */
  position: [number, number];
  /** Ширина проёма (метры) */
  width: number;
  /** Высота проёма (метры) */
  height: number;
}

/**
 * Режим отображения сцены.
 */
export type ViewMode = '2d' | '3d' | 'vr';

/**
 * Инструмент, выбранный пользователем в редакторе.
 */
export type Tool = 'select' | 'window' | 'door' | 'furniture' | 'partition';

/**
 * Цвета элементов комнаты.
 */
export interface RoomColors {
  /** Цвет стен */
  walls: string;
  /** Цвет пола */
  floor: string;
  /** Цвет потолка */
  ceiling: string;
}

/** Идентификаторы материалов (текстур) поверхностей; 'color' = только цвет. */
export interface RoomMaterials {
  walls: string;
  floor: string;
  ceiling: string;
}

/**
 * Отделка поверхности: текстура из галереи + цвет тонирования + масштаб.
 */
export interface SurfaceFinish {
  /** Идентификатор текстуры из галереи; null — однотонная поверхность */
  textureId: string | null;
  /** Цвет тонирования `#rrggbb` (для текстуры умножается на карту цвета) */
  color: string;
  /** Масштаб текстуры: 1 — натуральный размер тайла, 2 — тайл вдвое крупнее */
  scale: number;
}

/** Отделка всех поверхностей комнаты. */
export interface RoomFinishes {
  floor: SurfaceFinish;
  ceiling: SurfaceFinish;
  walls: Record<WallSide, SurfaceFinish>;
}

/** Поверхность, к которой применяется отделка. `walls` — все четыре стены сразу. */
export type FinishTarget = 'floor' | 'ceiling' | 'walls' | WallSide;

/**
 * Конструкция внешней стены: толщина (стена растёт наружу, внутренние размеры комнаты
 * не меняются) и материал. Отделка лицевой грани хранится отдельно, в `finishes.walls`.
 */
export interface OuterWallSpec {
  /** Толщина, м */
  thickness: number;
  /** Конструкционный материал */
  material: WallMaterialId;
}

/** Конструкция всех четырёх внешних стен. */
export type OuterWalls = Record<WallSide, OuterWallSpec>;

/**
 * Перегородка (внутренняя стена), которую можно добавить в комнату.
 */
export interface Partition {
  /** Уникальный идентификатор */
  id: string;
  /** Центр перегородки в мировых координатах (y — половина высоты) */
  position: [number, number, number];
  /** Поворот [x, y, z]; используется только поворот вокруг вертикали */
  rotation: [number, number, number];
  /** Габариты: длина, высота, толщина */
  size: [number, number, number];
  /** Проёмы (окна/двери) внутри перегородки */
  openings: Opening[];
  /** Отделка (если не задана — как у стен комнаты) */
  finish?: SurfaceFinish;
  /** Радиус скругления углов, м (0 — прямые углы) */
  cornerRadius?: number;
  /** Конструкционный материал (если не задан — гипсокартон) */
  material?: WallMaterialId;
}

/** Как задаётся цвет света комнаты. */
export type LightColorMode = 'temperature' | 'color';

/**
 * Конфигурация освещения комнаты (потолочные светильники + рассеянный свет).
 */
export interface LightConfig {
  /** Яркость потолочного света */
  intensity: number;
  /** Интенсивность окружающего (рассеянного) света */
  ambientIntensity: number;
  /** Цвет света при `colorMode = 'color'` */
  color: string;
  /** Включён ли свет в комнате */
  enabled: boolean;
  /** Цветовая температура, К (при `colorMode = 'temperature'`) */
  temperature: number;
  /** Источник цвета: температура или произвольный цвет */
  colorMode: LightColorMode;
  /** Отбрасывает ли свет тени */
  shadows: boolean;
}

/**
 * Полное состояние редактора 3D-сцены (Redux slice).
 */
export interface EditorState {
  /** Размеры комнаты (внутренние, в метрах) */
  dimensions: RoomDimensions;
  /** Цвета стен, пола, потолка (устаревшее поле, заменено `finishes`) */
  colors: RoomColors;
  /** Материалы (текстуры) поверхностей (устаревшее поле, заменено `finishes`) */
  materials: RoomMaterials;
  /** Отделка поверхностей комнаты */
  finishes: RoomFinishes;
  /** Толщина и материал каждой внешней стены */
  outerWalls: OuterWalls;
  /** Удалённые (скрытые) внешние стены */
  removedWalls: WallSide[];
  /** Конфигурация освещения */
  light: LightConfig;
  /** Текущий режим просмотра */
  viewMode: ViewMode;
  /** Активный инструмент */
  activeTool: Tool;
  /** Проёмы, сгруппированные по идентификатору стены */
  openings: { [wallId: string]: Opening[] };
  /** Список перегородок */
  partitions: Partition[];
  /** Цвета перегородок (ключ – id перегородки) */
  partitionColors: { [partitionId: string]: string };
  /** Идентификатор стены, выбранной для просмотра в 2D */
  viewedWallId: string;
  /** Выбранный пользователем проём для редактирования */
  selectedOpening: {
    wallId: string;
    opening: Opening;
    wallWidth: number;
    wallHeight: number;
  } | null;
  /** Выбранная перегородка для редактирования */
  selectedPartition: Partition | null;
  /** ID текущего открытого проекта */
  currentProjectId: string | null;
  /** Позиция персонажа/камеры в 3D режиме */
  playerPosition: [number, number, number] | null;
  /** Ротация персонажа/камеры в 3D режиме */
  playerRotation: [number, number, number] | null;
}

/**
 * Данные сцены редактора, загружаемые одной операцией (проект, шаблон, undo/redo).
 */
export interface EditorScenePayload {
  dimensions: RoomDimensions;
  finishes: RoomFinishes;
  outerWalls: OuterWalls;
  removedWalls: WallSide[];
  light: LightConfig;
  openings: { [wallId: string]: Opening[] };
  partitions: Partition[];
}
