/**
 * Превью моделей каталога (thumb.jpg 256 × 256): `npm run models:thumbs`.
 *
 * Поднимает локальный HTTP-сервер (страница thumbnail-page.html, three.js из node_modules,
 * public/assets) и рендерит модели в headless Chromium с той же нормализацией, что и в сцене.
 * По умолчанию рисует превью local-моделей, у которых его ещё нет (у Poly Haven — свои превью).
 *
 * Флаги: `--ids=a,b` — только эти модели; `--force` — перерисовать существующие;
 * `--view=front --out=<папка>` — вид строго спереди в отдельную папку (проверка фасада).
 */

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { gltfBounds, parseGltfJson } from '../../src/features/assets/lib/gltfBounds.ts';
import { parseModelsConfig } from '../../src/features/assets/lib/modelSources.ts';
import { resolveNormalization } from '../../src/features/furniture/lib/normalization.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MODELS_DIR = path.join(ROOT, 'public/assets/models');
const ROUTES = [
  ['/three/', path.join(ROOT, 'node_modules/three/')],
  ['/assets/', path.join(ROOT, 'public/assets/')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const log = (message) => process.stdout.write(`${message}\n`);

/** Разобрать аргументы командной строки. */
function parseArgs(argv) {
  const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const ids = value('ids');
  return { ids: ids ? new Set(ids.split(',')) : null, force: argv.includes('--force'), view: value('view') ?? 'three-quarter', out: value('out') };
}

/** Файл для запроса (только из разрешённых каталогов). */
function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (pathname === '/') return path.join(ROOT, 'scripts/models/thumbnail-page.html');
  const route = ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  if (!route) return null;
  const file = path.resolve(route[1], pathname.slice(route[0].length));
  return file.startsWith(route[1]) ? file : null;
}

/** Статический сервер для страницы рендера. */
function serve() {
  const server = createServer(async (req, res) => {
    const file = resolveRequest(req.url ?? '/');
    try {
      if (!file) throw new Error('forbidden');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Главный файл модели и параметры нормализации. */
async function modelParams(source) {
  const dir = path.join(MODELS_DIR, source.id);
  const main = source.source === 'local' ? source.file : (await readFile(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'))
    .match(new RegExp(`/assets/models/${source.id}/([\\w.-]+\\.gltf)`))?.[1];
  if (!main) throw new Error(`${source.id}: модель не найдена — сначала npm run models:sync`);
  const bounds = gltfBounds(parseGltfJson(await readFile(path.join(dir, main))));
  const n = resolveNormalization(bounds.size, { category: source.category, rule: source.normalize });
  return { file: `/assets/models/${source.id}/${main}`, scale: n.scale, rx: n.rotationX, ry: n.rotationY };
}

/** Отрендерить превью модели. @returns JPEG */
async function render(page, base, params, view) {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), view });
  await page.goto(`${base}/?${query}`);
  const dataUrl = await page.waitForFunction(() => window.__thumbnail, null, { timeout: 120_000 }).then((h) => h.jsonValue());
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Выбрать модели для рендера. */
async function pickSources(sources, args) {
  const exists = async (id) => readFile(path.join(MODELS_DIR, id, 'thumb.jpg')).then(() => true, () => false);
  const picked = [];
  for (const source of sources) {
    if (args.ids ? args.ids.has(source.id) : source.source === 'local' && (args.force || !(await exists(source.id)))) picked.push(source);
  }
  return picked;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = await pickSources(parseModelsConfig(JSON.parse(await readFile(path.join(ROOT, 'scripts/models/models.config.json'), 'utf8'))), args);
  if (sources.length === 0) return log('Новых превью нет');
  const server = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const source of sources) {
      const target = args.out ? path.join(args.out, `${source.id}.jpg`) : path.join(MODELS_DIR, source.id, 'thumb.jpg');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await render(page, base, await modelParams(source), args.view));
      log(`  ${source.id} → ${path.relative(ROOT, target)}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
