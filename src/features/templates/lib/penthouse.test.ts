import { describe, expect, it } from 'vitest';
import { floorFrames, floorRise } from '@/features/editor-3d/lib/building/floors';
import { rectArea, translateRect } from '@/features/editor-3d/lib/building/rects';
import { floorSlabs, hasOpenRoof, roofEdges, stairCutouts } from '@/features/editor-3d/lib/building/slabs';
import { furnitureFootprint, isFlatItem, partitionFootprint } from '@/features/editor-3d/lib/placement';
import { detectRooms } from '@/features/editor-3d/lib/rooms';
import type { FloorDocument } from '@/features/editor-3d/lib/scene/schema';
import { stairLayout } from '@/features/editor-3d/lib/stairs/stairs';
import { interiorRect } from '@/features/editor-3d/lib/walls';
import type { FurnitureItem } from '@/features/furniture/types';
import { obbBounds, obbOverlap, type Obb, type Rect } from '@/shared/lib/math/geometry2d';
import { penthouse } from './penthouse';

const rectObb = (r: Rect): Obb => ({ center: [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2], half: [(r.maxX - r.minX) / 2, (r.maxZ - r.minZ) / 2], angle: 0 });

/** Подписи помещений стоят каждая в своём помещении. */
function labelOwners(floor: FloorDocument): number[] {
  const rooms = detectRooms(floor.dimensions, floor.partitions);
  return floor.rooms.map((label) =>
    rooms.findIndex((r) => {
      const xs = r.outline.map((p) => p[0]);
      const zs = r.outline.map((p) => p[1]);
      return label.anchor[0] > Math.min(...xs) && label.anchor[0] < Math.max(...xs) && label.anchor[1] > Math.min(...zs) && label.anchor[1] < Math.max(...zs);
    }),
  );
}

describe('двухуровневый пентхаус', () => {
  const doc = penthouse();
  const [lower, upper] = doc.floors;
  const frames = floorFrames(doc.floors.map((f) => ({ id: f.id, offset: f.offset, height: f.dimensions.height })), doc.slabThickness);

  it('два уровня: внизу 15 × 10 м, наверху 15 × 7 м со сдвигом к задней стене', () => {
    expect(doc.floors).toHaveLength(2);
    expect(lower.dimensions.width * lower.dimensions.depth).toBe(150);
    expect(upper.dimensions.width * upper.dimensions.depth).toBe(105);
    expect(upper.offset).toEqual([0, -1.5]);
    expect(frames[1].base).toBeCloseTo(3.2 + doc.slabThickness);
  });

  it('внизу гостиная-кухня-столовая, гостевой санузел и балкон', () => {
    const areas = detectRooms(lower.dimensions, lower.partitions).map((r) => Math.round(r.area)).sort((a, b) => a - b);
    expect(areas).toHaveLength(3);
    expect(areas[0]).toBeLessThan(5);
    expect(areas[2]).toBeGreaterThan(100);
    expect(lower.rooms.map((r) => r.name)).toEqual(['Гостиная, кухня и столовая', 'Гостевой санузел', 'Панорамный балкон']);
  });

  it('наверху холл, коридор, кабинет, две спальни и ванная — каждая подпись в своём помещении', () => {
    expect(detectRooms(upper.dimensions, upper.partitions)).toHaveLength(6);
    const owners = labelOwners(upper);
    expect(owners).not.toContain(-1);
    expect(new Set(owners).size).toBe(6);
    expect(upper.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(['Кабинет', 'Мастер-спальня', 'Спальня', 'Ванная']));
    expect(new Set(labelOwners(lower)).size).toBe(3);
  });

  it('лестница из гостиной поднимается на верхний уровень, вырез над ней — внутри холла', () => {
    expect(lower.stairs).toHaveLength(1);
    const rise = floorRise(lower.dimensions, doc.slabThickness);
    const layout = stairLayout(lower.stairs[0].kind, rise, lower.stairs[0].width);
    expect(layout.riser).toBeGreaterThan(0.15);
    expect(layout.riser).toBeLessThanOrEqual(0.2);
    const cutout = translateRect(stairCutouts(lower.stairs, rise)[0], [lower.offset[0] - upper.offset[0], lower.offset[1] - upper.offset[1]]);
    const hall = interiorRect(upper.dimensions);
    expect(cutout.minX).toBeGreaterThanOrEqual(hall.minX);
    expect(cutout.maxZ).toBeLessThanOrEqual(hall.maxZ);
    // Наверху ничего не стоит над проёмом и стены его не пересекают
    upper.partitions.forEach((p) => expect(obbOverlap(partitionFootprint(p), rectObb(cutout)).overlapping, p.id).toBe(false));
    (upper.furniture as FurnitureItem[]).forEach((f) => expect(obbOverlap(furnitureFootprint(f), rectObb(cutout)).overlapping, f.id).toBe(false));
    // В полу верхнего уровня вырезано ровно место под лестницу
    const slabs = floorSlabs({ frame: frames[1], content: upper }, { frame: frames[0], content: lower }, doc.slabThickness);
    const outerArea = rectArea(obbBounds(rectObb({ minX: -7.8, maxX: 7.8, minZ: -3.8, maxZ: 3.8 })));
    const floorArea = slabs.floor.rects.reduce((sum, r) => sum + rectArea(r), 0);
    expect(outerArea - floorArea).toBeCloseTo(rectArea(cutout), 3);
  });

  it('крыша нижнего уровня перед верхним — терраса с ограждением, на неё выходят двери', () => {
    expect(hasOpenRoof({ frame: frames[0], content: lower }, { frame: frames[1], content: upper })).toBe(true);
    const edges = roofEdges({ frame: frames[0], content: lower }, { frame: frames[1], content: upper });
    const length = edges.reduce((sum, e) => sum + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0);
    expect(length).toBeCloseTo(15.6 + 3 * 2, 1);
    const terraceDoors = upper.openings.filter((o) => o.wallId === 'front' && o.door?.style === 'glass');
    expect(terraceDoors.length).toBeGreaterThanOrEqual(2);
  });

  it('предметы на поверхностях ссылаются на опоры своего этажа и стоят на их высоте', () => {
    doc.floors.forEach((floor) => {
      const items = floor.furniture as FurnitureItem[];
      const byId = new Map(items.map((f) => [f.id, f]));
      items
        .filter((f) => f.supportId)
        .forEach((item) => {
          const support = byId.get(item.supportId as string);
          expect(support, item.id).toBeDefined();
          expect(item.position[1], item.id).toBeCloseTo(support?.height ?? -1, 2);
        });
    });
    const upperSolid = (upper.furniture as FurnitureItem[]).filter((f) => !isFlatItem(f));
    expect(upperSolid.map((f) => f.id)).toEqual(expect.arrayContaining(['bed-master', 'bed-guest', 'study-desk', 'tub']));
  });

  it('за окнами — мегаполис на закате, внизу мрамор, наверху паркет', () => {
    expect(doc.environment.sky).toMatchObject({ mode: 'hdri', hdriId: 'sunset_jhbcentral' });
    expect(lower.finishes.floor.textureId).toBe('marble_01');
    expect(upper.finishes.floor.textureId).toBe('herringbone_parquet');
  });
});
