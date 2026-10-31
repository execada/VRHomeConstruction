/**
 * Поза камеры текущей сессии редактора (вне Redux — меняется непрерывно).
 * Сохраняется вместе с проектом, чтобы при следующем открытии камера была там же.
 * @module camera/model/cameraSession
 */

import { z } from 'zod';
import { createExternalStore } from '@/shared/lib/externalStore';
import type { CameraMode } from '../types';

const vec3 = z.tuple([z.number().min(-500).max(500), z.number().min(-500).max(500), z.number().min(-500).max(500)]);

/** Схема сохранённой позы камеры (часть roomData проекта). */
export const cameraPoseSchema = z.object({
  mode: z.enum(['orbit', 'fps', 'top', 'fixed']),
  position: vec3,
  /** Точка, на которую смотрит камера облёта */
  target: vec3,
  /** Поворот камеры от первого лица [pitch, yaw, 0] */
  rotation: vec3,
});

export type CameraPose = z.infer<typeof cameraPoseSchema>;

interface CameraSessionState {
  /** Последняя известная поза */
  pose: CameraPose | null;
  /** Поза для восстановления при открытии проекта (используется один раз) */
  restore: CameraPose | null;
}

export const cameraSession = createExternalStore<CameraSessionState>({ pose: null, restore: null });

/** Сообщить текущую позу камеры. */
export function reportCameraPose(pose: CameraPose): void {
  cameraSession.setState({ pose });
}

/** Задать позу для восстановления (загрузка проекта). */
export function setRestorePose(pose: CameraPose | null): void {
  cameraSession.setState({ restore: pose, pose });
}

/**
 * Забрать позу для восстановления, если она подходит режиму камеры.
 * @returns поза или null (после вызова восстановление больше не выполняется)
 */
export function takeRestorePose(mode: CameraMode): CameraPose | null {
  const { restore } = cameraSession.getState();
  if (!restore || restore.mode !== mode) return null;
  cameraSession.setState({ restore: null });
  return restore;
}
