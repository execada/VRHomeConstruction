/**
 * Какие проекты показать на доске: вкладка «Избранное», поиск и порядок (свежие сверху).
 * @module widgets/project-board/lib/visibleProjects
 */

import type { Project } from '@/features/create-project/types';
import { matchesQuery } from '@/shared/lib/search';

/** Время для сортировки: последнее изменение, иначе создание. */
function timeOf(project: Project): number {
  return Date.parse(project.updatedAt ?? project.createdAt) || 0;
}

/**
 * Отфильтровать и упорядочить проекты.
 * @param projects - все проекты пользователя
 * @param options - только избранные и строка поиска (название, описание, теги)
 */
export function visibleProjects(projects: Project[], options: { favoritesOnly: boolean; query: string }): Project[] {
  return projects
    .filter((p) => !options.favoritesOnly || p.favorite)
    .filter((p) => matchesQuery([p.name, p.description, ...(p.tags ?? [])], options.query))
    .map((p) => ({ project: p, time: timeOf(p) }))
    .sort((a, b) => b.time - a.time)
    .map(({ project }) => project);
}

/** Подпись под названием (Figma: «теги, описание пользователя»). */
export function projectSubtitle(project: Project): string {
  const tags = (project.tags ?? []).map((t) => `#${t}`).join(' ');
  return [tags, project.description?.trim()].filter(Boolean).join(' · ');
}
