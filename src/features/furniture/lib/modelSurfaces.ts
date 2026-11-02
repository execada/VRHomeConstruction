/**
 * Поверхности модели по её настоящей геометрии: треугольники мешей three.js
 * переводятся в нормализованную систему координат модели и передаются в {@link scanSurfaces}.
 * @module furniture/lib/modelSurfaces
 */

import { Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { scanSurfaces, type ModelSurface } from './surfaceScan';

/**
 * Треугольники видимых мешей объекта подряд по 9 чисел.
 * @param root - корень модели
 * @param frame - перевод мировых координат мешей в систему модели
 *   (для модели в сцене — обратная матрица её корня, для отдельного glTF — сдвиг нормализации)
 */
export function meshPositions(root: Object3D, frame: Matrix4): number[] {
  root.updateWorldMatrix(true, true);
  const positions: number[] = [];
  const matrix = new Matrix4();
  const vertex = new Vector3();
  root.traverseVisible((child) => {
    if (!(child instanceof Mesh)) return;
    const attribute = child.geometry?.getAttribute('position');
    if (!attribute) return;
    matrix.multiplyMatrices(frame, child.matrixWorld);
    const index = child.geometry.getIndex();
    const count = index ? index.count : attribute.count;
    for (let k = 0; k < count - (count % 3); k += 1) {
      vertex.fromBufferAttribute(attribute, index ? index.getX(k) : k).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  });
  return positions;
}

/**
 * Горизонтальные поверхности модели (столешница, полки) в её нормализованных координатах.
 * @param root - корень модели
 * @param frame - см. {@link meshPositions}
 */
export function measureSurfaces(root: Object3D, frame: Matrix4): ModelSurface[] {
  return scanSurfaces(meshPositions(root, frame));
}
