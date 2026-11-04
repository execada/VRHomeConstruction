import { describe, expect, it } from 'vitest';
import { WALL_THICKNESS_LIMITS } from '../constants';
import {
  DEFAULT_INTERIOR_MATERIAL,
  DEFAULT_OUTER_MATERIAL,
  isWallMaterialId,
  thicknessPresets,
  WALL_MATERIAL_IDS,
  WALL_MATERIALS,
  wallMaterial,
  wallMaterialTexture,
} from './wallMaterials';

describe('wall material registry', () => {
  it('has unique ids and covers the materials required by the brief', () => {
    expect(new Set(WALL_MATERIAL_IDS).size).toBe(WALL_MATERIALS.length);
    for (const id of ['brick', 'concrete', 'aerated', 'drywall']) expect(WALL_MATERIAL_IDS).toContain(id);
    expect(WALL_MATERIALS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every material a distinct 3D look and a distinct plan hatch/fill', () => {
    const looks = new Set(WALL_MATERIALS.map((m) => m.look.draw));
    expect(looks.size).toBe(WALL_MATERIALS.length);
    const plans = new Set(WALL_MATERIALS.map((m) => `${m.plan.hatch}|${m.plan.fill}`));
    expect(plans.size).toBe(WALL_MATERIALS.length);
  });

  it('keeps default thickness within the wall limits and among its presets', () => {
    for (const m of WALL_MATERIALS) {
      expect(m.thickness.presets).toContain(m.thickness.default);
      expect(m.thickness.default).toBeGreaterThanOrEqual(WALL_THICKNESS_LIMITS[0]);
      expect(m.thickness.default).toBeLessThanOrEqual(WALL_THICKNESS_LIMITS[1]);
      expect(m.look.tileMeters).toBeGreaterThan(0);
    }
  });

  it('validates ids and falls back to a default material', () => {
    expect(isWallMaterialId('brick')).toBe(true);
    expect(isWallMaterialId('adamantium')).toBe(false);
    expect(isWallMaterialId(5)).toBe(false);
    expect(wallMaterial('adamantium').id).toBe(DEFAULT_INTERIOR_MATERIAL);
    expect(wallMaterial(undefined, DEFAULT_OUTER_MATERIAL).id).toBe('brick');
  });

  it('filters thickness presets by limits', () => {
    expect(thicknessPresets('brick', [0.05, 0.5])).toEqual([0.12, 0.25, 0.38]);
    expect(thicknessPresets('drywall', [0.05, 0.6])).toEqual([0.075, 0.1, 0.125, 0.15]);
  });

  it('builds one cached procedural texture per material', () => {
    const a = wallMaterialTexture('aerated');
    expect(wallMaterialTexture('aerated')).toBe(a);
    expect(a.id).toBe('structure-aerated');
    expect(a.draw).toBe(wallMaterial('aerated').look.draw);
    expect(a.resolution).toBeGreaterThan(256);
  });
});
