import { describe, expect, it } from 'vitest';
import { obbBounds, obbOverlap } from '@/shared/lib/math/geometry2d';
import { furnitureFootprint, furnitureSubject, isFlatItem, partitionFootprint } from '@/features/editor-3d/lib/placement';
import { openingsOverlap, clampOpening } from '@/features/editor-3d/lib/openings';
import { sceneDocumentSchema } from '@/features/editor-3d/lib/scene/schema';
import { interiorRect, isWallSide, wallFrame } from '@/features/editor-3d/lib/walls';
import type { FurnitureItem } from '@/features/furniture/types';
import { BUILTIN_TEMPLATES, findBuiltinTemplate } from './builtins';

const verticalOverlap = (a: FurnitureItem, b: FurnitureItem) => {
  const ra = furnitureSubject(a).yRange;
  const rb = furnitureSubject(b).yRange;
  return ra[0] < rb[1] - 1e-6 && rb[0] < ra[1] - 1e-6;
};

describe.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))('template %s', (_name, template) => {
  const doc = template.build();

  it('passes the strict scene schema', () => {
    const parsed = sceneDocumentSchema.safeParse(doc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('keeps every item inside the room and above the floor', () => {
    const rect = interiorRect(doc.dimensions);
    for (const item of doc.furniture) {
      const b = obbBounds(furnitureFootprint(item));
      expect(b.minX, item.id).toBeGreaterThanOrEqual(rect.minX - 1e-6);
      expect(b.maxX, item.id).toBeLessThanOrEqual(rect.maxX + 1e-6);
      expect(b.minZ, item.id).toBeGreaterThanOrEqual(rect.minZ - 1e-6);
      expect(b.maxZ, item.id).toBeLessThanOrEqual(rect.maxZ + 1e-6);
      expect(item.position[1], item.id).toBeGreaterThanOrEqual(0);
      expect(item.position[1] + (item.height ?? 0), item.id).toBeLessThanOrEqual(doc.dimensions.height + 1e-6);
    }
  });

  it('has no furniture overlapping other furniture or partitions', () => {
    const solid = doc.furniture.filter((f) => !isFlatItem(f));
    solid.forEach((a, i) => {
      solid.slice(i + 1).forEach((b) => {
        const hit = verticalOverlap(a, b) && obbOverlap(furnitureFootprint(a), furnitureFootprint(b)).overlapping;
        expect(hit, `${a.id} × ${b.id}`).toBe(false);
      });
      doc.partitions.forEach((p) => {
        expect(obbOverlap(furnitureFootprint(a), partitionFootprint(p)).overlapping, `${a.id} × ${p.id}`).toBe(false);
      });
    });
  });

  it('has valid, non-overlapping openings on existing walls', () => {
    const byWall = new Map<string, typeof doc.openings>();
    doc.openings.forEach((o) => byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]));
    byWall.forEach((list, wallId) => {
      expect(isWallSide(wallId)).toBe(true);
      const frame = wallFrame(wallId as never, doc.dimensions);
      list.forEach((o) => expect(clampOpening(o, { length: frame.length, height: frame.height })).toEqual(o));
      list.forEach((a, i) => list.slice(i + 1).forEach((b) => expect(openingsOverlap(a, b)).toBe(false)));
    });
  });
});

describe('findBuiltinTemplate', () => {
  it('finds templates by id', () => {
    expect(findBuiltinTemplate('studio')?.name).toBe('Студия');
    expect(findBuiltinTemplate('nope')).toBeUndefined();
  });

  it('produces fresh documents on every build', () => {
    const template = BUILTIN_TEMPLATES[0];
    expect(template.build()).not.toBe(template.build());
  });
});
