/**
 * Типы фичи окружения: солнце за окнами и небо/пейзаж (HDRI).
 * @module environment/types
 */

/** Сторона дома, над которой солнце проходит в полдень (одна из двух). */
export type SunSide = 'front' | 'back';

/** Настройки солнца (направленный свет). */
export interface SunSettings {
  /** Включено ли солнце */
  enabled: boolean;
  /** Сторона дома, над которой солнце проходит в полдень */
  side: SunSide;
  /** Время суток, часы (0–24) */
  timeOfDay: number;
  /** Интенсивность солнечного света */
  intensity: number;
  /** Отбрасывает ли солнце тени */
  shadows: boolean;
}

/** Фон за окнами: HDRI-пейзаж, процедурное небо или сплошной цвет. */
export type SkyMode = 'hdri' | 'sky' | 'color';

/** Настройки неба и пейзажа. */
export interface SkySettings {
  mode: SkyMode;
  /** id HDRI из манифеста ассетов */
  hdriId: string | null;
  /** Цвет неба для режима `color` */
  color: string;
  /** Поворот пейзажа вокруг вертикали, градусы */
  rotation: number;
  /** Яркость пейзажа/отражений 0..2 */
  exposure: number;
}

/** Состояние окружения (Redux slice). */
export interface EnvironmentState {
  sun: SunSettings;
  sky: SkySettings;
}
