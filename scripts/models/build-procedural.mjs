/**
 * Процедурные модели каталога: `npm run models:procedural`.
 *
 * Строит премиальные предметы, для которых нет свободных фотореалистичных моделей
 * (кухонные модули, холодильник, ванна, душ, тумба с раковиной, стиральная машина,
 * кровать, тумба, обеденный стол, ковры, торшер, зеркало, телевизор, подушки, настенная полка,
 * кондиционер), и пишет glTF в
 * public/assets/models/<id>/. Материалы — CC0-текстуры Poly Haven 1k, скачиваются
 * идемпотентно (md5) в public/assets/models/_textures/ вместе с credits.json для LICENSES.md.
 * Затем: `npm run models:thumbs` и `npm run models:sync`.
 *
 * Флаги: `--ids=a,b` — только эти модели; `--offline` — не скачивать текстуры.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { polyhavenAuthors } from '../../src/features/assets/lib/modelSources.ts';
import { writeGltf } from './procedural/gltf-writer.mjs';
import { TEXTURES } from './procedural/materials.mjs';
import { fridgeFrenchDoor, kitchenBase, kitchenHobOven, kitchenIsland, kitchenSink } from './procedural/kitchen.mjs';
import { bathtubFreestanding, showerWalkIn, vanityWalnut, washingMachine } from './procedural/bathroom.mjs';
import {
  bedUpholstered,
  diningTableWalnut,
  floorLamp,
  floorMirror,
  nightstandWalnut,
  rugRound,
  rugWool,
  tv65,
} from './procedural/living.mjs';
import { pillowLinen, pillowVelvet } from './procedural/textiles.mjs';
import { splitAirConditioner, wallShelf } from './procedural/wall.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODELS_DIR = path.join(ROOT, 'public/assets/models');
const TEXTURE_DIR = path.join(MODELS_DIR, '_textures');
const HEADERS = { 'User-Agent': 'vrhc-asset-pipeline' };
const DOWNLOADS = 'https://dl.polyhaven.org/';

/** id модели → построитель. */
const MODELS = {
  kitchen_base_120: kitchenBase,
  kitchen_sink_120: kitchenSink,
  kitchen_hob_oven_60: kitchenHobOven,
  kitchen_island: kitchenIsland,
  fridge_french_door: fridgeFrenchDoor,
  bathtub_freestanding: bathtubFreestanding,
  shower_walk_in: showerWalkIn,
  vanity_walnut: vanityWalnut,
  washing_machine: washingMachine,
  bed_upholstered: bedUpholstered,
  nightstand_walnut: nightstandWalnut,
  dining_table_walnut: diningTableWalnut,
  rug_wool: rugWool,
  rug_round_boucle: rugRound,
  floor_lamp_drum: floorLamp,
  floor_mirror_arch: floorMirror,
  tv_65: tv65,
  pillow_velvet_ochre: pillowVelvet,
  pillow_linen_sand: pillowLinen,
  wall_shelf_oak: wallShelf,
  split_air_conditioner: splitAirConditioner,
};

const log = (message) => process.stdout.write(`${message}\n`);
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

/** GET JSON или байты с проверкой статуса. */
async function get(url, asJson) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return asJson ? res.json() : new Uint8Array(await res.arrayBuffer());
}

/** Скачать карты текстуры 1k (если их нет или md5 не совпадает). @returns автор */
async function syncTexture(id, maps) {
  const [info, files] = await Promise.all([get(`https://api.polyhaven.com/info/${id}`, true), get(`https://api.polyhaven.com/files/${id}`, true)]);
  for (const kind of maps) {
    const key = kind === 'diff' ? 'Diffuse' : kind;
    const remote = files[key]?.['1k']?.jpg;
    if (!remote?.url?.startsWith(DOWNLOADS) || !/^[a-f0-9]{32}$/.test(remote.md5)) throw new Error(`${id}: нет карты ${kind} 1k`);
    const target = path.join(TEXTURE_DIR, id, `${kind}.jpg`);
    const current = await readFile(target).catch(() => null);
    if (current && md5(current) === remote.md5) continue;
    const bytes = await get(remote.url, false);
    if (md5(bytes) !== remote.md5) throw new Error(`Контрольная сумма не совпала: ${remote.url}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    log(`  текстура ${id}/${kind}.jpg`);
  }
  return { id, author: polyhavenAuthors(info), source: `https://polyhaven.com/a/${id}`, license: 'CC0' };
}

/** Скачать все текстуры материалов и записать credits.json. */
async function syncTextures() {
  const credits = [];
  for (const [id, maps] of Object.entries(TEXTURES)) credits.push(await syncTexture(id, maps));
  await writeFile(path.join(TEXTURE_DIR, 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
}

/** Построить и записать модель. */
async function buildModel(id, build) {
  const { json, bin } = writeGltf(id, build().build());
  const dir = path.join(MODELS_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.gltf`), `${JSON.stringify(json)}\n`);
  await writeFile(path.join(dir, `${id}.bin`), bin);
  const triangles = json.accessors.filter((_, i) => json.meshes.some((m) => m.primitives[0].indices === i)).reduce((s, a) => s + a.count / 3, 0);
  log(`  ${id}: ${Math.round(triangles)} треугольников, ${(bin.byteLength / 1024).toFixed(0)} КБ геометрии`);
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.find((a) => a.startsWith('--ids='))?.slice(6).split(',');
  if (!argv.includes('--offline')) await syncTextures();
  for (const [id, build] of Object.entries(MODELS)) {
    if (!only || only.includes(id)) await buildModel(id, build);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
