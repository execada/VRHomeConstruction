/**
 * Схемы ответов API (проверка данных с сервера на границе системы).
 * Неизвестные поля отбрасываются; некорректный ответ превращается в понятную ошибку.
 * @module app/api/schemas
 */

import { z } from 'zod';
import type { Project } from '@/features/create-project/types';

const status = z
  .string()
  .catch('active')
  .transform((s): Project['status'] => (s === 'archived' || s === 'draft' ? s : 'active'));

/** Поза камеры: повреждённое значение не должно мешать открыть проект — заменяется на null. */
const vec3 = z.array(z.number()).length(3).nullable().optional().catch(null);

/** Превью — только встроенная картинка data:image (как проверяет сервер); прочее отбрасывается. */
const SAFE_THUMBNAIL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const thumbnail = z
  .string()
  .optional()
  .default('')
  .transform((value) => (SAFE_THUMBNAIL.test(value) ? value : ''));

export const projectSchema = z.object({
  _id: z.string().min(1),
  name: z.string(),
  description: z.string().optional().default(''),
  tags: z.array(z.string()).nullable().optional().transform((t) => t ?? []),
  favorite: z.boolean().optional().default(false),
  thumbnail,
  template: z.string().nullable().optional(),
  number: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  status,
  roomData: z.unknown().optional(),
  playerPosition: vec3,
  playerRotation: vec3,
});

export const projectListSchema = z.object({
  data: z.array(z.unknown()).nullable().transform((d) => d ?? []),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  pages: z.number(),
});

export const layoutSchema = z.object({
  _id: z.string().min(1),
  name: z.string(),
  description: z.string().optional().default(''),
  thumbnail,
  roomData: z.unknown().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().optional().default(''),
  avatar: z.string().nullable().optional(),
  username: z.string().max(64).optional(),
  role: z.string().max(32).optional(),
});

/** Ответ входа и регистрации: пользователь и токен сессии. */
export const authResponseSchema = z.object({
  user: userSchema,
  token: z.string().min(1),
});

/** Ответ на запрос кода регистрации: текст для пользователя и токен заявки. */
export const sendCodeResponseSchema = z.object({
  message: z.string().optional().default(''),
  token: z.string().min(1).max(128),
});

/** Ответ с текстом для пользователя (восстановление пароля). */
export const messageResponseSchema = z.object({
  message: z.string().max(500).optional().default(''),
});

/** Полные данные проекта (с документом сцены). */
export type ProjectDetails = Project & {
  roomData: unknown;
  playerPosition: [number, number, number] | null;
  playerRotation: [number, number, number] | null;
};

const toVec3 = (v: number[] | null | undefined): [number, number, number] | null =>
  v && v.length === 3 ? [v[0], v[1], v[2]] : null;

/** Проект из ответа сервера (без roomData). */
export function toProject(raw: unknown): Project {
  const p = projectSchema.parse(raw);
  return {
    id: p._id,
    name: p.name,
    description: p.description,
    tags: p.tags,
    favorite: p.favorite,
    thumbnail: p.thumbnail,
    template: p.template ?? undefined,
    number: p.number ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    status: p.status,
  };
}

/** Полный проект из ответа сервера. */
export function toProjectDetails(raw: unknown): ProjectDetails {
  const p = projectSchema.parse(raw);
  return { ...toProject(raw), roomData: p.roomData, playerPosition: toVec3(p.playerPosition), playerRotation: toVec3(p.playerRotation) };
}
