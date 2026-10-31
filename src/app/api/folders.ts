import { api } from './client';
import type { Folder } from '@/features/folders/types';

export async function fetchFolders(): Promise<Folder[]> {
  const tree = await api.get<any[]>('/api/folders');
  const flatten = (nodes: any[]): any[] =>
    nodes.flatMap(n => [api.mapFolder(n), ...flatten(n.children || [])]);
  return flatten(tree ?? []);
}

export async function createFolder(name: string, parentId?: string | null): Promise<Folder> {
  const res = await api.post<any>('/api/folders', { name, parentId: parentId || null });
  return api.mapFolder(res);
}

export async function updateFolder(id: string, data: Partial<Folder>): Promise<Folder> {
  const res = await api.put<any>(`/api/folders/${id}`, data);
  return api.mapFolder(res);
}

export async function deleteFolder(id: string): Promise<void> {
  await api.del(`/api/folders/${id}`);
}
