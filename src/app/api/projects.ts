/**
 * API проектов: список (все страницы), полный проект, создание, сохранение сцены,
 * частичное изменение (избранное, имя, описание, теги, превью), дублирование, удаление.
 * @module app/api/projects
 */

import { api } from './client';
import { projectListSchema, toProject, toProjectDetails, type ProjectDetails } from './schemas';
import type { Project } from '@/features/create-project/types';

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

/** Все проекты пользователя (постранично, без документов сцены). */
export async function fetchProjects(): Promise<Project[]> {
  const pages: Project[][] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = projectListSchema.parse(await api.get<unknown>(`/api/projects?page=${page}&limit=${PAGE_LIMIT}`));
    pages.push(res.data.map(toProject));
    if (page >= res.pages) break;
  }
  return pages.flat();
}

/** Полный проект с документом сцены. */
export async function fetchProject(id: string): Promise<ProjectDetails> {
  return toProjectDetails(await api.get<unknown>(`/api/projects/${encodeURIComponent(id)}`));
}

/** Параметры создания проекта. */
export interface CreateProjectInput {
  name: string;
  status?: Project['status'];
  roomData?: unknown;
  description?: string;
  tags?: string[];
  template?: string;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return toProject(await api.post<unknown>('/api/projects', { status: 'active', ...input }));
}

/** Тело полного сохранения сцены. */
export interface SaveProjectInput {
  name: string;
  status: Project['status'];
  roomData: unknown;
  playerPosition?: [number, number, number] | null;
  playerRotation?: [number, number, number] | null;
  /** Превью; не передавать — оставить текущее */
  thumbnail?: string;
}

export async function updateProject(id: string, data: SaveProjectInput): Promise<Project> {
  const body = {
    ...data,
    playerPosition: data.playerPosition ?? undefined,
    playerRotation: data.playerRotation ?? undefined,
  };
  return toProject(await api.put<unknown>(`/api/projects/${encodeURIComponent(id)}`, body));
}

/** Частичное изменение проекта. */
export type ProjectPatch = Partial<Pick<Project, 'name' | 'description' | 'tags' | 'favorite' | 'thumbnail' | 'status'>>;

export async function patchProject(id: string, patch: ProjectPatch): Promise<Project> {
  return toProject(await api.patch<unknown>(`/api/projects/${encodeURIComponent(id)}`, patch));
}

/** Копия проекта («Название (копия)»). */
export async function duplicateProject(id: string): Promise<Project> {
  return toProject(await api.post<unknown>(`/api/projects/${encodeURIComponent(id)}/duplicate`, {}));
}

export async function deleteProject(id: string): Promise<void> {
  await api.del(`/api/projects/${encodeURIComponent(id)}`);
}
