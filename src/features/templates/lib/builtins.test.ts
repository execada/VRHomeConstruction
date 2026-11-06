import { describe, expect, it } from 'vitest';
import { obbBounds, obbOverlap, type Obb } from '@/shared/lib/math/geometry2d';
import { floorRise } from '@/features/editor-3d/lib/building/floors';
import { furnitureFootprint, furnitureSubject, isFlatItem, partitionFootprint } from '@/features/editor-3d/lib/placement';
import { openingsOverlap, clampOpening } from '@/features/editor-3d/lib/openings';
import { sceneDocumentSchema, type FloorDocument } from '@/features/editor-3d/lib/scene/schema';
import { stairFootprint, stairLayout } from '@/features/editor-3d/lib/stairs/stairs';
import { interiorRect, isWallSide, wallFrame } from '@/features/editor-3d/lib/walls';
import type { FurnitureItem } from '@/features/furniture/types';
import { BUILTIN_TEMPLATES, findBuiltinTemplate } from './builtins';

const verticalOverlap = (a: FurnitureItem, b: FurnitureItem) => {
  const ra = furnitureSubject(a).yRange;
  const rb = furnitureSubject(b).yRange;
  return ra[0] < rb[1] - 1e-6 && rb[0] < ra[1] - 1e-6;
};

/** Футпринты лестниц этажа (подъём — высота этажа и перекрытие). */
const stairFootprints = (floor: FloorDocument, slab: number): Obb[] =>
  floor.stairs.map((s) => stairFootprint(s, stairLayout(s.kind, floorRise(floor.dimensions, slab), s.width)));

const insideRoom = (footprint: Obb, floor: FloorDocument, label: string) => {
  const rect = interiorRect(floor.dimensions);
  const b = obbBounds(footprint);
  expect(b.minX, label).toBeGreaterThanOrEqual(rect.minX - 1e-6);
  expect(b.maxX, label).toBeLessThanOrEqual(rect.maxX + 1e-6);
  expect(b.minZ, label).toBeGreaterThanOrEqual(rect.minZ - 1e-6);
  expect(b.maxZ, label).toBeLessThanOrEqual(rect.maxZ + 1e-6);
};

describe.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))('template %s', (_name, template) => {
  const doc = template.build();
  const floors = doc.floors.map((floor) => [floor.name, floor] as const);

  it('passes the strict scene schema', () => {
    const parsed = sceneDocumentSchema.safeParse(doc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it.each(floors)('%s: every item is inside the room and above the floor', (_floor, floor) => {
    for (const item of floor.furniture as FurnitureItem[]) {
      insideRoom(furnitureFootprint(item), floor, item.id);
      expect(item.position[1], item.id).toBeGreaterThanOrEqual(0);
      expect(item.position[1] + (item.height ?? 0), item.id).toBeLessThanOrEqual(floor.dimensions.height + 1e-6);
    }
    stairFootprints(floor, doc.slabThickness).forEach((f, i) => insideRoom(f, floor, floor.stairs[i].id));
  });

  it.each(floors)('%s: no furniture overlaps other furniture, walls or stairs', (_floor, floor) => {
    const solid = (floor.furniture as FurnitureItem[]).filter((f) => !isFlatItem(f));
    const stairs = stairFootprints(floor, doc.slabThickness);
    solid.forEach((a, i) => {
      solid.slice(i + 1).forEach((b) => {
        const hit = verticalOverlap(a, b) && obbOverlap(furnitureFootprint(a), furnitureFootprint(b)).overlapping;
        expect(hit, `${a.id} × ${b.id}`).toBe(false);
      });
      floor.partitions.forEach((p) => {
        expect(obbOverlap(furnitureFootprint(a), partitionFootprint(p)).overlapping, `${a.id} × ${p.id}`).toBe(false);
      });
      stairs.forEach((s, k) => expect(obbOverlap(furnitureFootprint(a), s).overlapping, `${a.id} × ${floor.stairs[k].id}`).toBe(false));
    });
    stairs.forEach((s, k) =>
      floor.partitions.forEach((p) => expect(obbOverlap(s, partitionFootprint(p)).overlapping, `${floor.stairs[k].id} × ${p.id}`).toBe(false)),
    );
  });

  it.each(floors)('%s: valid, non-overlapping openings on existing walls', (_floor, floor) => {
    const byWall = new Map<string, typeof floor.openings>();
    floor.openings.forEach((o) => byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]));
    byWall.forEach((list, wallId) => {
      expect(isWallSide(wallId)).toBe(true);
      const frame = wallFrame(wallId as never, floor.dimensions);
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
