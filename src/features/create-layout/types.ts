/**
 * Типы для фичи создания макетов (пользовательских шаблонов комнат).
 * @module create-layout/types
 */

export interface Layout {
  id: string;
  name: string;
  /** Описание шаблона */
  description?: string;
  /** Превью (data URL JPEG) */
  thumbnail?: string;
  createdAt?: string;
}
