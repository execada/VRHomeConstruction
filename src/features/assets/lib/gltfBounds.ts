/**
 * Габариты glTF-модели без загрузки геометрии: границы POSITION-аксессоров (min/max
 * обязательны по спецификации) с учётом иерархии узлов — так же, как Box3.setFromObject
 * в three.js. Используется конвейером ассетов (scripts/models) в Node, поэтому модуль
 * не зависит от three.js и браузера.
 * @module assets/lib/gltfBounds
 */

/** Минимальное подмножество glTF 2.0, нужное для расчёта габаритов. */
export interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }> }>;
  accessors?: Array<{ count: number; min?: number[]; max?: number[] }>;
  buffers?: Array<{ uri?: string; byteLength: number }>;
  images?: Array<{ uri?: string; bufferView?: number }>;
  [key: string]: unknown;
}

/** Габариты модели в единицах файла. */
export interface GltfBounds {
  min: [number, number, number];
  max: [number, number, number];
  size: { x: number; y: number; z: number };
  /** Треугольников с учётом всех экземпляров мешей */
  triangles: number;
}

type Mat4 = number[];
type Vec3 = [number, number, number];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const GLB_MAGIC = 0x46546c67;
const TRIANGLES = 4;
const STRIP_OR_FAN = new Set([5, 6]);

/** Произведение матриц 4×4 (column-major, как в glTF). */
function multiply(a: Mat4, b: Mat4): Mat4 {
  return IDENTITY.map((_, i) => {
    const col = Math.floor(i / 4);
    const row = i % 4;
    return a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
  });
}

/** Локальная матрица узла из matrix или translation/rotation/scale. */
function localMatrix(node: NonNullable<GltfJson['nodes']>[number]): Mat4 {
  if (node.matrix?.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const transform = (m: Mat4, p: Vec3): Vec3 => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]) as Vec3;

/** Восемь углов бокса аксессора. */
function corners(min: number[], max: number[]): Vec3[] {
  return Array.from({ length: 8 }, (_, i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]] as Vec3);
}

/** Треугольники примитива по режиму отрисовки. */
function primitiveTriangles(json: GltfJson, primitive: NonNullable<GltfJson['meshes']>[number]['primitives'][number]): number {
  const accessor = json.accessors?.[primitive.indices ?? primitive.attributes.POSITION];
  const count = accessor?.count ?? 0;
  const mode = primitive.mode ?? TRIANGLES;
  if (mode === TRIANGLES) return Math.floor(count / 3);
  return STRIP_OR_FAN.has(mode) ? Math.max(0, count - 2) : 0;
}

/** Обойти узлы сцены с мировыми матрицами. */
function visitMeshes(json: GltfJson, visit: (mesh: number, world: Mat4) => void): void {
  const walk = (index: number, parent: Mat4, depth: number) => {
    const node = json.nodes?.[index];
    if (!node || depth > 64) return;
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) visit(node.mesh, world);
    node.children?.forEach((child) => walk(child, world, depth + 1));
  };
  json.scenes?.[json.scene ?? 0]?.nodes?.forEach((root) => walk(root, IDENTITY, 0));
}

/**
 * Габариты сцены glTF по умолчанию.
 * @param json - разобранный glTF
 */
export function gltfBounds(json: GltfJson): GltfBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  visitMeshes(json, (meshIndex, world) => {
    json.meshes?.[meshIndex]?.primitives.forEach((primitive) => {
      triangles += primitiveTriangles(json, primitive);
      const position = json.accessors?.[primitive.attributes.POSITION];
      if (!position?.min || !position.max) return;
      corners(position.min, position.max).forEach((corner) => {
        transform(world, corner).forEach((v, k) => {
          min[k] = Math.min(min[k], v);
          max[k] = Math.max(max[k], v);
        });
      });
    });
  });
  if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0], size: { x: 0, y: 0, z: 0 }, triangles };
  return { min, max, size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }, triangles };
}

/**
 * JSON модели из файла .gltf или контейнера .glb.
 * @throws Error, если контейнер GLB повреждён
 */
export function parseGltfJson(bytes: Uint8Array): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    return JSON.parse(new TextDecoder().decode(bytes)) as GltfJson;
  }
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) throw new Error('Повреждённый GLB: JSON-блок выходит за пределы файла');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson;
}

/** Внешние файлы модели (буферы и текстуры) без встроенных data:-URI, без повторов. */
export function gltfResourceUris(json: GltfJson): string[] {
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((r) => r.uri)
    .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'));
  return [...new Set(uris)];
}
