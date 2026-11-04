/**
 * Типы галереи текстур.
 * @module textures/types
 */

/** Поверхность, для которой предназначена текстура. */
export type TextureCategory = 'floor' | 'wall' | 'ceiling';

/** Функция рисования процедурной текстуры на canvas. */
export type TextureDraw = (ctx: CanvasRenderingContext2D, size: number) => void;

/** Описание текстуры в галерее. */
export interface TextureDef {
  id: string;
  label: string;
  category: TextureCategory;
  /** Размер одного тайла в метрах (при масштабе 1) */
  tileMeters: number;
  /** Шероховатость, если нет карты шероховатости */
  roughness: number;
  /** PBR-карты (для текстур из манифеста) */
  maps?: { color: string; normal?: string; roughness?: string };
  /** Превью (для PBR — файл; для процедурных генерируется) */
  thumbnail?: string;
  /** Процедурная текстура (рисуется на canvas, без загрузки файлов) */
  draw?: TextureDraw;
  /** Размер холста процедурной текстуры, px (по умолчанию 256) */
  resolution?: number;
  /** Источник и лицензия (для экрана «Лицензии») */
  credit?: { source: string; license: string; author: string };
}
