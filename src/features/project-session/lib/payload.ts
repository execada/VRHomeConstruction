/**
 * Сборка тела сохранения проекта и восстановление позы камеры из сохранённых данных.
 * @module project-session/lib/payload
 */

import { cameraPoseSchema, type CameraPose } from '@/features/camera/model/cameraSession';
import type { Project } from '@/features/create-project/types';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import type { SaveProjectInput } from '@/app/api/projects';

const NAME_LIMIT = 120;

/**
 * Тело PUT /api/projects/:id: документ сцены + поза камеры.
 * Поза от первого лица дублируется в playerPosition/playerRotation (совместимость с v1).
 */
export function buildSavePayload(params: {
  project: Pick<Project, 'name' | 'status'>;
  doc: SceneDocument;
  camera: CameraPose | null;
  thumbnail?: string | null;
}): SaveProjectInput {
  const { project, doc, camera, thumbnail } = params;
  const fps = camera?.mode === 'fps' ? camera : null;
  return {
    name: project.name.trim().slice(0, NAME_LIMIT) || 'Без названия',
    status: project.status,
    roomData: camera ? { ...doc, camera } : doc,
    playerPosition: fps ? fps.position : null,
    playerRotation: fps ? fps.rotation : null,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

/** Ключ для сравнения «изменилось ли что-то с последнего сохранения». */
export function payloadKey(payload: SaveProjectInput): string {
  return JSON.stringify([payload.name, payload.status, payload.roomData, payload.playerPosition, payload.playerRotation]);
}

/**
 * Поза камеры из сохранённого проекта: v2 хранит её в roomData.camera,
 * v1 — только позицию/поворот от первого лица.
 */
export function cameraFromProject(
  roomData: unknown,
  playerPosition: [number, number, number] | null,
  playerRotation: [number, number, number] | null,
): CameraPose | null {
  const stored = (roomData as { camera?: unknown } | null | undefined)?.camera;
  const parsed = cameraPoseSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  if (playerPosition) {
    return { mode: 'fps', position: playerPosition, target: [0, 0, 0], rotation: playerRotation ?? [0, 0, 0] };
  }
  return null;
}
