import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { normalizationMatrix, prepareModel } from './modelLook';
import { measureSurfaces } from './modelSurfaces';

/** Стол, смоделированный в сантиметрах: столешница 160 × 90 на высоте 75, четыре ножки. */
function tableInCentimeters(): Group {
  const material = new MeshStandardMaterial();
  const table = new Group();
  const top = new Mesh(new BoxGeometry(160, 4, 90), material);
  top.position.set(0, 73, 0);
  table.add(top);
  for (const [x, z] of [[-75, -40], [75, -40], [-75, 40], [75, 40]]) {
    const leg = new Mesh(new BoxGeometry(4, 71, 4), material);
    leg.position.set(x, 35.5, z);
    table.add(leg);
  }
  table.updateMatrixWorld(true);
  return table;
}

function surfaceFrame(scene: Group) {
  const prepared = prepareModel(scene, { category: 'tables' });
  const frame = new Matrix4().makeTranslation(...prepared.offset).multiply(normalizationMatrix(prepared.normalization));
  return { prepared, frame };
}

describe('поверхности нормализованных моделей', () => {
  it('матрица нормализации совпадает с обёрткой модели', () => {
    const { prepared } = surfaceFrame(tableInCentimeters());
    expect(prepared.normalization.scale).toBeCloseTo(0.01, 5);
    prepared.object.updateMatrix();
    const expected = normalizationMatrix(prepared.normalization).elements;
    prepared.object.matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));
  });

  it('столешница модели в сантиметрах оказывается на высоте 0,75 м', () => {
    const scene = tableInCentimeters();
    const { frame } = surfaceFrame(scene);
    const top = measureSurfaces(scene, frame).reduce((best, s) => (s.y > best.y ? s : best));

    expect(top.y).toBeCloseTo(0.75, 2);
    expect(top.maxX - top.minX).toBeCloseTo(1.6, 2);
    expect(top.maxZ - top.minZ).toBeCloseTo(0.9, 2);
  });
});
