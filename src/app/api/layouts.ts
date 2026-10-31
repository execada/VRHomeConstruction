/**
 * API пользовательских шаблонов (макетов): список, полный шаблон со сценой, создание,
 * изменение, удаление.
 * @module app/api/layouts
 */

import { api } from './client';
import { layoutSchema } from './schemas';
import type { Layout } from '@/features/create-layout/types';

/** Шаблон с документом сцены. */
export type LayoutDetails = Layout & { roomData: unknown };

function toLayout(raw: unknown): Layout {
  const l = layoutSchema.parse(raw);
  return { id: l._id, name: l.name, description: l.description, thumbnail: l.thumbnail, createdAt: l.createdAt };
}

export async function fetchLayouts(): Promise<Layout[]> {
  const res = await api.get<unknown[]>('/api/layouts');
  return (Array.isArray(res) ? res : []).map(toLayout);
}

export async function fetchLayout(id: string): Promise<LayoutDetails> {
  const raw = await api.get<unknown>(`/api/layouts/${encodeURIComponent(id)}`);
  return { ...toLayout(raw), roomData: layoutSchema.parse(raw).roomData };
}

/** Поля шаблона для создания/изменения. */
export interface LayoutInput {
  name: string;
  description?: string;
  roomData?: unknown;
  thumbnail?: string;
}

export async function createLayout(input: LayoutInput | string): Promise<Layout> {
  const body = typeof input === 'string' ? { name: input } : input;
  return toLayout(await api.post<unknown>('/api/layouts', body));
}

export async function updateLayout(id: string, input: LayoutInput | string): Promise<Layout> {
  const body = typeof input === 'string' ? { name: input } : input;
  return toLayout(await api.put<unknown>(`/api/layouts/${encodeURIComponent(id)}`, body));
}

export async function deleteLayout(id: string): Promise<void> {
  await api.del(`/api/layouts/${encodeURIComponent(id)}`);
}
