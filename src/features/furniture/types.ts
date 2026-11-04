/**
 * Типы для фичи мебели.
 * Описывает предмет мебели и состояние хранилища.
 * @module furniture/types
 */

/**
 * Предмет мебели, размещённый в комнате.
 */
export interface FurnitureItem {
  id: string;
  name: string;
  modelPath: string;
  /**
   * Позиция центра низа модели: [x, высота низа над полом, z].
   * y = 0 — предмет стоит на полу (модели нормализуются по габаритам).
   */
  position: [number, number, number];
  scale: number;
  /** Поворот; используется только вокруг вертикали — предмет всегда стоит ровно */
  rotation: [number, number, number];
  /** Половина ширины модели при scale = 1 (если измерена) */
  halfWidth?: number;
  /** Половина глубины модели при scale = 1 (если измерена) */
  halfDepth?: number;
  /** Высота модели при scale = 1 (если измерена) */
  height?: number;
  /** Закреплён ли предмет (нельзя случайно сдвинуть) */
  locked?: boolean;
  /** Цвет тонирования модели `#rrggbb` (null — исходные материалы) */
  color?: string | null;
  /**
   * id опоры (стол, полка, тумба), на поверхности которой стоит предмет.
   * Позиция остаётся мировой; опора переносит такие предметы вместе с собой.
   */
  supportId?: string;
}

/**
 * Состояние мебели в Redux.
 */
export interface FurnitureState {
  items: FurnitureItem[];
  selectedFurniturePath?: string;
  selectedFurniture: FurnitureItem | null;
  showFurnitureModal: boolean;
}