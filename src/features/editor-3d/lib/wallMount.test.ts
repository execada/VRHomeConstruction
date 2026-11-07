import { describe, expect, it } from 'vitest';
import { normalizeAngle } from '@/shared/lib/math/geometry2d';
import { createPartition } from './partitions';
import { faceByRay, faceOfItem, hitsOpening, nearestFace, resolveOnFace, WALL_GAP, wallFaces, wallPose, type WallSource } from './wallMount';
import type { Opening } from '../types';

const dims = { width: 5, height: 2.7, depth: 4 };
const room = (extra: Partial<WallSource> = {}): WallSource => ({ dimensions: dims, partitions: [], openings: {}, removedWalls: [], ...extra });
const picture = { halfWidth: 0.3, halfDepth: 0.01, height: 0.8 };
const window: Opening = { id: 'w', wallId: 'back', type: 'window', position: [0, 1.6], width: 1.2, height: 1.4 };
const face = (source: WallSource, id: string) => wallFaces(source).find((f) => f.frame.id === id)!;
const always = () => true;

describe('грани стен', () => {
  it('четыре внешние стены изнутри, удалённая стена не в счёт; проёмы — в координатах грани', () => {
    expect(wallFaces(room()).map((f) => f.frame.id)).toEqual(['front', 'back', 'left', 'right']);
    expect(wallFaces(room({ removedWalls: ['front'] })).map((f) => f.frame.id)).toEqual(['back', 'left', 'right']);
    const [hole] = face(room({ openings: { back: [window] } }), 'back').holes;
    [hole.u0, hole.u1, hole.v0, hole.v1].forEach((v, i) => expect(v).toBeCloseTo([-0.6, 0.6, 0.9, 2.3][i]));
  });

  it('у перегородки две грани по обе стороны, проёмы на тыльной зеркальны', () => {
    const p = { ...createPartition({ id: 'p', center: [0, 0], dims, length: 3 }), openings: [{ ...window, wallId: 'p', position: [0.8, 1.05] as [number, number], height: 2.1 }] };
    const faces = wallFaces(room({ partitions: [p] }));
    const a = faces.find((f) => f.frame.id === 'p:a')!;
    const b = faces.find((f) => f.frame.id === 'p:b')!;
    expect(a.frame.normal[1]).toBeCloseTo(1);
    expect(b.frame.normal[1]).toBeCloseTo(-1);
    expect(a.frame.origin[1] - b.frame.origin[1]).toBeCloseTo(p.size[2]);
    expect(b.holes[0].u0).toBeCloseTo(-a.holes[0].u1);
    expect(normalizeAngle(b.frame.rotationY - a.frame.rotationY - Math.PI)).toBeCloseTo(0);
  });
});

describe('выбор грани', () => {
  it('луч изнутри попадает в дальнюю стену; снаружи — ближняя стена пропускается', () => {
    const faces = wallFaces(room());
    const inside = faceByRay(faces, { origin: [0, 1.6, 1], direction: [0, 0, -1] })!;
    expect(inside.face.frame.id).toBe('back');
    expect(inside.v).toBeCloseTo(1.6);
    const outside = faceByRay(faces, { origin: [0, 3, 6], direction: [0, -0.2, -1] })!;
    expect(outside.face.frame.id).toBe('back');
  });

  it('луч в пол или мимо стен — ничего; ближняя по лучу грань перегородки важнее внешней стены', () => {
    const faces = wallFaces(room({ partitions: [createPartition({ id: 'p', center: [0, -1], dims, length: 3 })] }));
    expect(faceByRay(faces, { origin: [0, 1.6, 1], direction: [0, -1, -0.3] })).toBeNull();
    expect(faceByRay(faces, { origin: [0, 1.6, 1], direction: [0, 0, -1] })?.face.frame.id).toBe('p:a');
  });

  it('без луча — ближайшая стена со стороны точки, не дальше 1,2 м', () => {
    const faces = wallFaces(room());
    expect(nearestFace(faces, [-2.2, 0.5])?.face.frame.id).toBe('left');
    expect(nearestFace(faces, [-2.2, 0.5])?.u).toBeCloseTo(-0.5);
    expect(nearestFace(wallFaces(room({ dimensions: { ...dims, width: 8, depth: 8 } })), [0, 0])).toBeNull();
  });
});

describe('предмет на грани', () => {
  it('прижат задней стороной к стене с зазором, фасадом в комнату', () => {
    const back = face(room(), 'back');
    const pose = wallPose(back, picture, 0.5, 1.1);
    expect(pose.center[0]).toBeCloseTo(0.5);
    expect(pose.center[1]).toBeCloseTo(-2 + picture.halfDepth + WALL_GAP);
    expect(pose.angle).toBeCloseTo(back.frame.rotationY);
    expect(pose.elevation).toBe(1.1);
    expect(faceOfItem(wallFaces(room()), pose.center, pose.angle, picture.halfDepth)).toMatchObject({ u: expect.closeTo(0.5) });
  });

  it('не выходит за торцы и выше стены', () => {
    const back = face(room(), 'back');
    const r = resolveOnFace(back, picture, 10, 5, always);
    expect(r.valid).toBe(true);
    expect(r.u).toBeCloseTo(2.5 - 0.3 - 0.02);
    expect(r.pose.elevation).toBeCloseTo(2.7 - 0.8);
  });

  it('обходит окно: сдвигается вдоль стены к ближайшему свободному месту', () => {
    const back = face(room({ openings: { back: [window] } }), 'back');
    expect(hitsOpening(back, picture, 0.2, 1.2)).toBe(true);
    const r = resolveOnFace(back, picture, 0.2, 1.2, always);
    expect(r.valid).toBe(true);
    expect(hitsOpening(back, picture, r.u, 1.2)).toBe(false);
    expect(r.u).toBeGreaterThan(0.6 + 0.3);
  });

  it('мебель мешает — ищет место рядом; не помещается или всё занято — недопустимо', () => {
    const back = face(room(), 'back');
    const blocked = (pose: { center: readonly number[] }) => pose.center[0] > -1 && pose.center[0] < 1;
    const r = resolveOnFace(back, picture, 0.1, 1.2, (pose) => !blocked(pose));
    expect(r.valid).toBe(true);
    expect(Math.abs(r.u)).toBeGreaterThanOrEqual(1);
    expect(resolveOnFace(back, picture, 0, 1.2, () => false).valid).toBe(false);
    expect(resolveOnFace(back, { ...picture, halfWidth: 3 }, 0, 1, always).valid).toBe(false);
  });
});
