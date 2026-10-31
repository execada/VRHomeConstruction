/**
 * Типы для фичи создания проектов.
 * @module create-project/types
 */

/** Проект */
export interface Project {
  id: string;
  name: string;
  /** Шаблон проекта (опционально — задаётся при наличии) */
  template?: string;
  /** Порядковый номер проекта пользователя (назначается бэкендом) */
  number?: number;
  createdAt: string;
  /** Время последнего изменения */
  updatedAt?: string;
  status: 'active' | 'archived' | 'draft';
  /** В избранном */
  favorite?: boolean;
  /** Описание пользователя */
  description?: string;
  /** Теги */
  tags?: string[];
  /** Превью (data URL JPEG) */
  thumbnail?: string;
}

/** Статус загрузки списка проектов */
export type ProjectsStatus = 'idle' | 'loading' | 'ready' | 'error';
