import { describe, expect, it } from 'vitest';
import { detectRooms } from '@/features/editor-3d/lib/rooms';
import { penthouse } from './penthouse';

describe('апартаменты 150 м²', () => {
  const doc = penthouse();

  it('квартира 15 × 10 м: 150 м² по внутренним граням внешних стен', () => {
    expect(doc.dimensions.width * doc.dimensions.depth).toBe(150);
  });

  it('стены образуют пять настоящих помещений с ожидаемой площадью', () => {
    const rooms = detectRooms(doc.dimensions, doc.partitions);
    const areas = rooms.map((r) => Math.round(r.area)).sort((a, b) => a - b);
    expect(rooms).toHaveLength(5);
    expect(areas).toEqual([9, 12, 19, 23, 83]);
  });

  it('каждая подпись помещения стоит внутри своего помещения', () => {
    const rooms = detectRooms(doc.dimensions, doc.partitions);
    const names = doc.rooms.map((label) => {
      const owner = rooms.findIndex((r) => {
        const xs = r.outline.map((p) => p[0]);
        const zs = r.outline.map((p) => p[1]);
        return label.anchor[0] > Math.min(...xs) && label.anchor[0] < Math.max(...xs) && label.anchor[1] > Math.min(...zs) && label.anchor[1] < Math.max(...zs);
      });
      return owner;
    });
    expect(new Set(names).size).toBe(5);
    expect(names).not.toContain(-1);
  });

  it('предметы на поверхностях ссылаются на существующие опоры и стоят на их высоте', () => {
    const byId = new Map(doc.furniture.map((f) => [f.id, f]));
    const supported = doc.furniture.filter((f) => f.supportId);
    expect(supported.map((f) => f.id)).toEqual(expect.arrayContaining(['tv', 'dining-vase', 'island-vase', 'bust']));
    supported.forEach((item) => {
      const support = byId.get(item.supportId as string);
      expect(support, item.id).toBeDefined();
      expect(item.position[1], item.id).toBeCloseTo(support?.height ?? -1, 2);
    });
  });

  it('за окнами — мегаполис на закате, на полу — мрамор', () => {
    expect(doc.environment.sky).toMatchObject({ mode: 'hdri', hdriId: 'sunset_jhbcentral' });
    expect(doc.finishes.floor.textureId).toBe('marble_01');
  });
});
