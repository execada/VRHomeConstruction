import { describe, expect, it } from 'vitest';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import { buildSavePayload, cameraFromProject, payloadKey } from './payload';

const doc = createEmptyScene();
const orbit = { mode: 'orbit' as const, position: [5, 5, 5] as [number, number, number], target: [0, 1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] };

describe('buildSavePayload', () => {
  it('embeds the camera pose into roomData', () => {
    const payload = buildSavePayload({ project: { name: 'Кухня', status: 'active' }, doc, camera: orbit });
    expect((payload.roomData as { camera: unknown }).camera).toEqual(orbit);
    expect(payload.playerPosition).toBeNull();
    expect(payload).not.toHaveProperty('thumbnail');
  });

  it('mirrors first-person poses into playerPosition/playerRotation', () => {
    const fps = { ...orbit, mode: 'fps' as const, rotation: [0.1, 1, 0] as [number, number, number] };
    const payload = buildSavePayload({ project: { name: 'A', status: 'active' }, doc, camera: fps, thumbnail: 'data:image/jpeg;base64,AA' });
    expect(payload.playerPosition).toEqual([5, 5, 5]);
    expect(payload.playerRotation).toEqual([0.1, 1, 0]);
    expect(payload.thumbnail).toBe('data:image/jpeg;base64,AA');
  });

  it('never sends an empty or oversized name', () => {
    expect(buildSavePayload({ project: { name: '   ', status: 'draft' }, doc, camera: null }).name).toBe('Без названия');
    expect(buildSavePayload({ project: { name: 'x'.repeat(300), status: 'draft' }, doc, camera: null }).name).toHaveLength(120);
  });

  it('ignores the thumbnail in the change key', () => {
    const a = buildSavePayload({ project: { name: 'A', status: 'active' }, doc, camera: null });
    const b = buildSavePayload({ project: { name: 'A', status: 'active' }, doc, camera: null, thumbnail: 'data:image/jpeg;base64,AA' });
    expect(payloadKey(a)).toBe(payloadKey(b));
  });
});

describe('cameraFromProject', () => {
  it('reads the v2 camera pose', () => {
    expect(cameraFromProject({ camera: orbit }, null, null)).toEqual(orbit);
  });

  it('falls back to the v1 player position', () => {
    expect(cameraFromProject({}, [1, 1.6, 2], [0, 0.5, 0])).toEqual({ mode: 'fps', position: [1, 1.6, 2], target: [0, 0, 0], rotation: [0, 0.5, 0] });
  });

  it('returns null without any stored pose and rejects invalid poses', () => {
    expect(cameraFromProject(null, null, null)).toBeNull();
    expect(cameraFromProject({ camera: { mode: 'drone' } }, null, null)).toBeNull();
  });
});
