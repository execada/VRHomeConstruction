import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { measureSurfaces, meshPositions } from './modelSurfaces';

const material = new MeshBasicMaterial();

/** Письменный стол из боксов: столешница 1.4 × 0.7 на высоте 0.75 и две боковины. */
function desk(): Group {
  const group = new Group();
  const top = new Mesh(new BoxGeometry(1.4, 0.05, 0.7), material);
  top.position.set(0, 0.725, 0);
  const left = new Mesh(new BoxGeometry(0.05, 0.7, 0.7), material);
  left.position.set(-0.675, 0.35, 0);
  const right = new Mesh(new BoxGeometry(0.05, 0.7, 0.7), material);
  right.position.set(0.675, 0.35, 0);
  group.add(top, left, right);
  return group;
}

describe('model surfaces from meshes', () => {
  it('collects mesh triangles in the requested frame', () => {
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(1, 1, 1), material));
    const positions = meshPositions(group, new Matrix4().makeTranslation(0, 0.5, 0));
    expect(positions).toHaveLength(12 * 9);
    expect(Math.min(...positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(0);
  });

  it('measures the tabletop of a model', () => {
    const [top] = measureSurfaces(desk(), new Matrix4());
    expect(top.y).toBeCloseTo(0.75, 3);
    expect(top.maxX - top.minX).toBeCloseTo(1.4, 2);
    expect(top.maxZ - top.minZ).toBeCloseTo(0.7, 2);
  });

  it('ignores where the model stands in the scene when measured relative to its root', () => {
    const model = desk();
    const parent = new Group();
    parent.position.set(3, 1, -2);
    parent.rotation.y = 0.7;
    parent.scale.setScalar(2);
    parent.add(model);
    model.updateWorldMatrix(true, false);
    const [top] = measureSurfaces(model, model.matrixWorld.clone().invert());
    expect(top.y).toBeCloseTo(0.75, 3);
    expect(top.maxX - top.minX).toBeCloseTo(1.4, 2);
  });

  it('skips hidden meshes and objects without geometry', () => {
    const model = desk();
    model.children.forEach((child) => {
      child.visible = false;
    });
    model.add(new Group());
    expect(measureSurfaces(model, new Matrix4())).toEqual([]);
  });
});
