import { describe, expect, it } from 'vitest';
import { boundingRect, exposedEdges, intersectRects, pointInRect, rectArea, subtractRects, translateRect } from './rects';

const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
const area = (rects: ReturnType<typeof subtractRects>) => rects.reduce((sum, r) => sum + rectArea(r), 0);

describe('прямоугольники плана', () => {
  it('сдвигает, пересекает и охватывает', () => {
    expect(translateRect(rect(0, 1, 0, 2), [1, -1])).toEqual(rect(1, 2, -1, 1));
    expect(intersectRects(rect(0, 2, 0, 2), rect(1, 3, 1, 3))).toEqual(rect(1, 2, 1, 2));
    expect(intersectRects(rect(0, 1, 0, 1), rect(1, 2, 0, 1))).toBeNull();
    expect(boundingRect([rect(0, 1, 0, 1), rect(-2, 0, 3, 4)])).toEqual(rect(-2, 1, 0, 4));
    expect(boundingRect([])).toBeNull();
    expect(pointInRect([1, 1], rect(0, 1, 0, 1))).toBe(true);
    expect(pointInRect([1.1, 1], rect(0, 1, 0, 1))).toBe(false);
  });

  it('вырезает отверстие посередине: остаток покрывает ровно разность площадей', () => {
    const outer = rect(-5, 5, -3, 3);
    const hole = rect(-1, 1, -2, 0.5);
    const pieces = subtractRects(outer, [hole]);
    expect(area(pieces)).toBeCloseTo(rectArea(outer) - rectArea(hole));
    pieces.forEach((p) => expect(intersectRects(p, hole)).toBeNull());
    pieces.forEach((p, i) => pieces.slice(i + 1).forEach((q) => expect(intersectRects(p, q)).toBeNull()));
  });

  it('учитывает пересекающиеся и выходящие за край отверстия', () => {
    const outer = rect(0, 4, 0, 4);
    const pieces = subtractRects(outer, [rect(-1, 2, -1, 2), rect(1, 3, 1, 3), rect(10, 11, 10, 11)]);
    // Объединение отверстий внутри: 2×2 + 2×2 − 1×1 = 7
    expect(area(pieces)).toBeCloseTo(16 - 7);
  });

  it('без отверстий возвращает исходный прямоугольник, полностью закрытый — пустоту', () => {
    const outer = rect(0, 2, 0, 2);
    expect(subtractRects(outer, [])).toEqual([outer]);
    expect(subtractRects(outer, [rect(-1, 3, -1, 3)])).toEqual([]);
  });

  it('склеивает куски: отверстие у края даёт два прямоугольника', () => {
    expect(subtractRects(rect(0, 4, 0, 4), [rect(0, 1, 0, 4)])).toEqual([rect(1, 4, 0, 4)]);
    expect(subtractRects(rect(0, 4, 0, 4), [rect(0, 1, 0, 1)])).toHaveLength(2);
  });

  it('находит открытые края крыши, не закрытые этажом выше', () => {
    const roof = rect(-7.8, 7.8, -5.3, 5.3);
    const upper = rect(-7.8, 7.8, -5.3, 2.3);
    const edges = exposedEdges(roof, [upper]);
    const length = edges.reduce((sum, e) => sum + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0);
    expect(length).toBeCloseTo(15.6 + 3 + 3);
    expect(edges.every((e) => Math.max(e.a[1], e.b[1]) >= 2.3 - 1e-9)).toBe(true);
    expect(exposedEdges(roof, [])).toHaveLength(4);
    expect(exposedEdges(roof, [rect(-10, 10, -10, 10)])).toEqual([]);
  });
});
