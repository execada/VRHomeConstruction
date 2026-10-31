/**
 * Типы фичи истории изменений (отмена/повтор).
 * @module history/types
 */

import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';

/** Стеки снимков сцены. */
export interface HistoryState {
  /** Снимки до изменений (последний — ближайший к текущему) */
  past: SceneDocument[];
  /** Отменённые снимки для повтора */
  future: SceneDocument[];
}
