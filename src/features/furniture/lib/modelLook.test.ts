import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import { applyLook, hasLook, prepareModel } from './modelLook';

function scene() {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(2, 1, 0.5), new MeshStandardMaterial({ color: '#ffffff' }));
  mesh.position.set(1, 3, -2);
  root.add(mesh, new PointLight());
  return root;
}

describe('prepareModel', () => {
  it('normalizes the bottom to the floor and the center to the origin', () => {
    const prepared = prepareModel(scene());
    expect(prepared.offset[0]).toBeCloseTo(-1);
    expect(prepared.offset[1]).toBeCloseTo(-2.5);
    expect(prepared.offset[2]).toBeCloseTo(2);
    expect(prepared.sizes).toEqual({ halfWidth: 1, halfDepth: 0.25, height: 1 });
  });

  it('clones the scene, enables shadows and hides embedded lights', () => {
    const source = scene();
    const prepared = prepareModel(source);
    expect(prepared.object).not.toBe(source);
    const mesh = prepared.object.children[0] as Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(prepared.object.children[1].visible).toBe(false);
  });

  it('handles empty scenes', () => {
    expect(prepareModel(new Group()).sizes.height).toBe(1);
  });
});

describe('applyLook', () => {
  it('detects when a look is needed', () => {
    expect(hasLook({})).toBe(false);
    expect(hasLook({ ghost: true })).toBe(true);
  });

  it('tints cloned materials without touching the originals', () => {
    const prepared = prepareModel(scene());
    const mesh = prepared.object.children[0] as Mesh;
    const original = mesh.material as MeshStandardMaterial;
    const restore = applyLook(prepared.object, { tint: '#ff0000' });
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe('ff0000');
    expect(original.color.getHexString()).toBe('ffffff');
    restore();
    expect(mesh.material).toBe(original);
  });

  it('makes ghosts translucent and disables their shadows', () => {
    const prepared = prepareModel(scene());
    applyLook(prepared.object, { ghost: true });
    const mesh = prepared.object.children[0] as Mesh;
    expect((mesh.material as MeshStandardMaterial).transparent).toBe(true);
    expect(mesh.castShadow).toBe(false);
  });
});
