import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTER_WALLS, uniformOuterWalls } from '../constants';
import { applyOuterWallPatch, uniformThickness, updateOuterWalls } from './outerWalls';
import type { WallMaterialId } from '../types';

describe('outer wall construction', () => {
  it('changes a single wall without touching the others', () => {
    const next = updateOuterWalls(DEFAULT_OUTER_WALLS, 'left', { thickness: 0.38, material: 'aerated' });
    expect(next.left).toEqual({ thickness: 0.38, material: 'aerated' });
    expect(next.front).toBe(DEFAULT_OUTER_WALLS.front);
    expect(DEFAULT_OUTER_WALLS.left.material).toBe('brick');
  });

  it('changes all walls at once', () => {
    const next = updateOuterWalls(DEFAULT_OUTER_WALLS, 'all', { material: 'monolith' });
    expect(Object.values(next).every((w) => w.material === 'monolith')).toBe(true);
    expect(next.back.thickness).toBe(DEFAULT_OUTER_WALLS.back.thickness);
  });

  it('clamps thickness and ignores unknown materials or NaN', () => {
    const spec = { thickness: 0.2, material: 'brick' as const };
    expect(applyOuterWallPatch(spec, { thickness: 5 }).thickness).toBeCloseTo(0.6);
    expect(applyOuterWallPatch(spec, { thickness: 0.001 }).thickness).toBeCloseTo(0.05);
    expect(applyOuterWallPatch(spec, { thickness: Number.NaN }).thickness).toBe(0.2);
    expect(applyOuterWallPatch(spec, { material: 'mithril' as WallMaterialId }).material).toBe('brick');
  });

  it('reports a uniform thickness only when all walls match', () => {
    expect(uniformThickness(uniformOuterWalls(0.3))).toBeCloseTo(0.3);
    expect(uniformThickness(updateOuterWalls(DEFAULT_OUTER_WALLS, 'right', { thickness: 0.4 }))).toBeNull();
  });
});
