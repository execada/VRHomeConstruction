import { describe, expect, it } from 'vitest';
import { wallFrame } from '@/features/editor-3d/lib/walls';
import type { FurnitureItem } from '@/features/furniture/types';
import { fitViewBox, footprintPoints, itemsNearWall, planDrawOrder, polygonPoints, slideAlongWall, zoomViewBox } from './plan';

const dims = { width: 4, height: 2.7, depth: 4 };

const item = (id: string, x: number, z: number, y = 0): FurnitureItem => ({
  id,
  name: id,
  modelPath: 'primitive:desk',
  position: [x, y, z],
  rotation: [0, 0, 0],
  scale: 1,
  halfWidth: 0.5,
  halfDepth: 0.3,
  height: 0.75,
});

describe('svg helpers', () => {
  it('formats polygon points', () => {
    expect(polygonPoints([[0, 0], [1, 0.5]])).toBe('0.0000,0.0000 1.0000,0.5000');
    expect(footprintPoints({ center: [0, 0], half: [1, 1], angle: 0 }).split(' ')).toHaveLength(4);
  });

  it('fits a view box with margins', () => {
    expect(fitViewBox({ minX: -2, maxX: 2, minZ: -1, maxZ: 1 }, 0.5)).toEqual({ x: -2.5, y: -1.5, width: 5, height: 3 });
  });

  it('zooms around the focus point and respects limits', () => {
    const view = { x: 0, y: 0, width: 10, height: 10 };
    const zoomed = zoomViewBox(view, [5, 5], 0.5, { min: 1, max: 50 });
    expect(zoomed).toEqual({ x: 2.5, y: 2.5, width: 5, height: 5 });
    expect(zoomViewBox(view, [0, 0], 0.01, { min: 1, max: 50 }).width).toBe(1);
  });
});

describe('itemsNearWall', () => {
  it('projects items standing at a wall onto its plane', () => {
    const back = wallFrame('back', dims);
    const [p] = itemsNearWall([item('desk', 1, -1.7)], back, 0.6);
    expect(p.u0).toBeCloseTo(0.5);
    expect(p.u1).toBeCloseTo(1.5);
    expect(p.depth).toBeCloseTo(0);
    expect(p.top).toBeCloseTo(0.75);
  });

  it('ignores items far from the wall', () => {
    expect(itemsNearWall([item('desk', 0, 0)], wallFrame('back', dims), 0.6)).toHaveLength(0);
  });

  it('mirrors the axis for the front wall (viewed from inside)', () => {
    const front = wallFrame('front', dims);
    const [p] = itemsNearWall([item('desk', 1, 1.7)], front, 0.6);
    expect(p.u1).toBeCloseTo(-0.5);
    expect(p.u0).toBeCloseTo(-1.5);
  });

  it('keeps elevation of wall-mounted items', () => {
    const [p] = itemsNearWall([item('shelf', 0, -1.7, 1.5)], wallFrame('back', dims), 0.6);
    expect(p.bottom).toBeCloseTo(1.5);
  });

  it('draws items standing on a support over it, even when they are farther from the wall', () => {
    const shelf = { ...item('shelf', 0, -1.7), height: 1.8 };
    const vase = { ...item('vase', 0, -1.55, 0.52), halfWidth: 0.1, halfDepth: 0.1, height: 0.3, supportId: 'shelf' };
    expect(itemsNearWall([vase, shelf], wallFrame('back', dims), 0.6).map((p) => p.item.id)).toEqual(['shelf', 'vase']);
  });

  it('slides items along the wall tangent', () => {
    const [x, z] = slideAlongWall(item('a', 0, 0), wallFrame('left', dims), 1);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });
});

describe('planDrawOrder', () => {
  it('draws rugs first, then furniture, then items standing on supports', () => {
    const bookcase = { ...item('bookcase', 0, 0), height: 1.8 };
    const rug = { ...item('rug', 0, 0), height: 0.02 };
    const book = { ...item('book', 0, 0, 0.52), height: 0.2, supportId: 'bookcase' };
    const desk = item('desk', 1, 0);
    expect(planDrawOrder([book, bookcase, desk, rug]).map((i) => i.id)).toEqual(['rug', 'desk', 'bookcase', 'book']);
  });
});
