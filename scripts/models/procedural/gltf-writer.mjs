/**
 * Минимальный writer glTF 2.0 для процедурных моделей: по одному мешу на материал
 * (мало draw call — важно для Quest), POSITION/NORMAL/TEXCOORD_0 + индексы, PBR-материалы
 * с текстурами по относительным URI (общая папка _textures), без расширений.
 */

const FLOAT = 5126;
const UINT16 = 5123;
const UINT32 = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const REPEAT = 10497;
const LINEAR_MIPMAP_LINEAR = 9987;
const LINEAR = 9729;

/** Накопитель бинарного буфера с выравниванием по 4 байтам. */
class BinaryBuffer {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  /** Добавить типизированный массив. @returns смещение и длина */
  push(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const offset = this.length;
    this.chunks.push(bytes);
    const padding = (4 - (bytes.byteLength % 4)) % 4;
    if (padding) this.chunks.push(new Uint8Array(padding));
    this.length += bytes.byteLength + padding;
    return { offset, byteLength: bytes.byteLength };
  }

  /** Склеенный буфер. */
  concat() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }
}

/** Границы VEC3-атрибута (обязательны для POSITION). */
function bounds(array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < array.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], array[i + k]);
      max[k] = Math.max(max[k], array[i + k]);
    }
  }
  return { min, max };
}

/** Добавить аксессор (bufferView + accessor). @returns индекс аксессора */
function addAccessor(json, bin, array, type, componentType, target, withBounds = false) {
  const { offset, byteLength } = bin.push(array);
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength, target });
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
  const accessor = { bufferView: json.bufferViews.length - 1, componentType, count: array.length / size, type };
  json.accessors.push(withBounds ? { ...accessor, ...bounds(array) } : accessor);
  return json.accessors.length - 1;
}

/** Индекс текстуры по URI (с переиспользованием). */
function textureIndex(json, uri) {
  const existing = json.images.findIndex((image) => image.uri === uri);
  if (existing >= 0) return json.textures.findIndex((t) => t.source === existing);
  json.images.push({ uri, mimeType: 'image/jpeg' });
  json.textures.push({ sampler: 0, source: json.images.length - 1 });
  return json.textures.length - 1;
}

/** Материал glTF из описания (см. materials.mjs). */
function materialJson(json, material) {
  const pbr = { baseColorFactor: material.color, metallicFactor: material.metalness, roughnessFactor: material.roughness };
  const maps = material.maps ?? {};
  const out = { name: material.name, pbrMetallicRoughness: pbr };
  if (maps.color) pbr.baseColorTexture = { index: textureIndex(json, maps.color) };
  if (maps.arm) {
    pbr.metallicRoughnessTexture = { index: textureIndex(json, maps.arm) };
    out.occlusionTexture = { index: textureIndex(json, maps.arm) };
  }
  if (maps.normal) out.normalTexture = { index: textureIndex(json, maps.normal), scale: material.normalScale ?? 1 };
  if (material.emissive) out.emissiveFactor = material.emissive;
  if (material.opacity !== undefined && material.opacity < 1) {
    out.alphaMode = 'BLEND';
    pbr.baseColorFactor = [...material.color.slice(0, 3), material.opacity];
  }
  if (material.doubleSided) out.doubleSided = true;
  return out;
}

/** Меш одного материала. */
function addMesh(json, bin, { material, geometry }) {
  const attrs = geometry.attributes;
  const index = geometry.index.array;
  const vertexCount = attrs.position.count;
  const indices = vertexCount < 65536 ? Uint16Array.from(index) : Uint32Array.from(index);
  const primitive = {
    attributes: {
      POSITION: addAccessor(json, bin, Float32Array.from(attrs.position.array), 'VEC3', FLOAT, ARRAY_BUFFER, true),
      NORMAL: addAccessor(json, bin, Float32Array.from(attrs.normal.array), 'VEC3', FLOAT, ARRAY_BUFFER),
      TEXCOORD_0: addAccessor(json, bin, Float32Array.from(attrs.uv.array), 'VEC2', FLOAT, ARRAY_BUFFER),
    },
    indices: addAccessor(json, bin, indices, 'SCALAR', indices instanceof Uint16Array ? UINT16 : UINT32, ELEMENT_ARRAY_BUFFER),
    material: json.materials.length,
  };
  json.materials.push(materialJson(json, material));
  json.meshes.push({ name: material.name, primitives: [primitive] });
  json.nodes.push({ name: material.name, mesh: json.meshes.length - 1 });
  return json.nodes.length - 1;
}

/**
 * Собрать glTF.
 * @param {string} id - id модели (имя буфера)
 * @param {Array<{material: object, geometry: import('three').BufferGeometry}>} meshes - меши по материалам
 * @returns {{ json: object, bin: Uint8Array }}
 */
export function writeGltf(id, meshes) {
  const json = {
    asset: { version: '2.0', generator: 'VR Home Construction procedural models' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    images: [],
    textures: [],
    samplers: [{ magFilter: LINEAR, minFilter: LINEAR_MIPMAP_LINEAR, wrapS: REPEAT, wrapT: REPEAT }],
  };
  const bin = new BinaryBuffer();
  const children = meshes.map((mesh) => addMesh(json, bin, mesh));
  json.nodes.push({ name: id, children });
  json.scenes[0].nodes.push(json.nodes.length - 1);
  const data = bin.concat();
  json.buffers.push({ uri: `${id}.bin`, byteLength: data.byteLength });
  if (json.images.length === 0) ['images', 'textures', 'samplers'].forEach((key) => delete json[key]);
  return { json, bin: data };
}
