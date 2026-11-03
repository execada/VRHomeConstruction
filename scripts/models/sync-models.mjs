/**
 * Конвейер 3D-моделей каталога: `npm run models:sync`.
 *
 * Для каждой модели из scripts/models/models.config.json:
 * - Poly Haven — скачивает glTF 1k, буферы, текстуры и превью по публичному API
 *   (идемпотентно: файл с совпадающей md5 не скачивается повторно);
 * - local — берёт готовый glTF из public/assets/models/<id>/ (сторонние CC0/CC BY и
 *   процедурные модели, см. README в этой папке);
 * затем измеряет габариты (границы аксессоров + иерархия узлов), применяет нормализацию
 * (единицы, ось «вверх», поправки из конфигурации), проверяет диапазон реальных размеров
 * категории и переписывает раздел `models` манифеста и таблицы моделей в LICENSES.md.
 * Остальные разделы манифеста (HDRI, текстуры) не трогаются.
 *
 * Флаги: `--offline` — без сети (только измерение уже скачанных файлов);
 * `--check` — ничего не писать, код 1, если манифест или LICENSES.md устарели;
 * `--only=id1,id2` — скачивать только перечисленные модели.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gltfBounds, gltfResourceUris, parseGltfJson } from '../../src/features/assets/lib/gltfBounds.ts';
import { parseManifest } from '../../src/features/assets/lib/manifest.ts';
import {
  buildModelEntry,
  parseModelsConfig,
  pickPolyhavenFiles,
  polyhavenAuthors,
  renderAttributions,
  renderLicenseRows,
  replaceBetweenMarkers,
} from '../../src/features/assets/lib/modelSources.ts';
import { formatSizeIssue, resolveNormalization, validateSize } from '../../src/features/furniture/lib/normalization.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ASSETS = path.join(ROOT, 'public/assets');
const MODELS_DIR = path.join(ASSETS, 'models');
const MANIFEST = path.join(ASSETS, 'manifest.json');
const LICENSES = path.join(ASSETS, 'LICENSES.md');
const CONFIG = path.join(ROOT, 'scripts/models/models.config.json');
const API = 'https://api.polyhaven.com';
const HEADERS = { 'User-Agent': 'vrhc-asset-pipeline' };
const TIMEOUT_MS = 60_000;
const MODELS_MARKERS = ['<!-- models:start -->', '<!-- models:end -->'];
const ATTRIBUTION_MARKERS = ['<!-- attributions:start -->', '<!-- attributions:end -->'];
const TABLE_HEAD = '| Asset id | Type | Author | Source | License |\n|---|---|---|---|---|';

const log = (message) => process.stdout.write(`${message}\n`);
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

/** Разобрать аргументы командной строки. */
function parseArgs(argv) {
  const only = argv.find((a) => a.startsWith('--only='));
  return {
    offline: argv.includes('--offline') || argv.includes('--check'),
    check: argv.includes('--check'),
    only: only ? new Set(only.slice('--only='.length).split(',')) : null,
  };
}

/** GET с таймаутом; ошибка с понятным текстом при неуспешном ответе. */
async function request(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res;
}

const fetchJson = async (url) => (await request(url)).json();
const fetchBytes = async (url) => new Uint8Array(await (await request(url)).arrayBuffer());

/** Содержимое файла или null, если его нет. */
async function readIfExists(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Путь внутри public/assets (защита от выхода за пределы каталога ассетов). */
function insideAssets(dir, relative) {
  const target = path.resolve(dir, decodeURIComponent(relative));
  if (!target.startsWith(`${ASSETS}${path.sep}`)) throw new Error(`Файл вне public/assets: ${relative}`);
  return target;
}

/** Скачать файл, если его нет или md5 не совпадает. @returns true, если файл скачан */
async function syncFile(dir, file) {
  const target = insideAssets(dir, file.path);
  const current = await readIfExists(target);
  if (current && md5(current) === file.md5) return false;
  const bytes = await fetchBytes(file.url);
  if (md5(bytes) !== file.md5) throw new Error(`Контрольная сумма не совпала: ${file.url}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return true;
}

/** Скачать модель Poly Haven (glTF 1k, буферы, текстуры, превью). */
async function downloadPolyhaven(source) {
  const dir = path.join(MODELS_DIR, source.id);
  const [info, files] = await Promise.all([fetchJson(`${API}/info/${source.id}`), fetchJson(`${API}/files/${source.id}`)]);
  const remote = pickPolyhavenFiles(files);
  let fetched = 0;
  for (const file of remote) fetched += (await syncFile(dir, file)) ? 1 : 0;
  const thumb = path.join(dir, 'thumb.jpg');
  if (!(await readIfExists(thumb))) {
    await writeFile(thumb, await fetchBytes(`https://cdn.polyhaven.com/asset_img/thumbs/${source.id}.png?width=256&height=256&format=jpg`));
    fetched += 1;
  }
  log(`  ${source.id}: ${fetched > 0 ? `скачано файлов: ${fetched}` : 'актуально'}`);
  return { author: polyhavenAuthors(info), main: remote.find((f) => f.main).path };
}

/** Уже скачанная модель Poly Haven (офлайн): главный .gltf и автор из прежнего манифеста. */
async function existingPolyhaven(source, previous) {
  const dir = path.join(MODELS_DIR, source.id);
  const names = await readdir(dir).catch(() => []);
  const main = previous ? path.basename(previous.file) : names.find((n) => /_1k\.gltf$/.test(n));
  if (!main || !names.includes(main)) throw new Error(`${source.id}: модель не скачана — запустите без --offline`);
  return { author: previous?.author ?? 'Poly Haven', main };
}

/** Файлы источника: скачать или найти локально. */
async function resolveFiles(source, previous, args) {
  if (source.source === 'local') return { author: source.credit.author, main: source.file };
  const download = !args.offline && (!args.only || args.only.has(source.id));
  return download ? downloadPolyhaven(source) : existingPolyhaven(source, previous);
}

/** Измерить модель и собрать запись манифеста. */
async function measure(source, files) {
  const dir = path.join(MODELS_DIR, source.id);
  const bytes = await readFile(insideAssets(dir, files.main));
  const json = parseGltfJson(bytes);
  const bounds = gltfBounds(json);
  const normalization = resolveNormalization(bounds.size, { category: source.category, rule: source.normalize });
  const deps = await Promise.all(gltfResourceUris(json).map((uri) => stat(insideAssets(dir, uri))));
  if (!(await readIfExists(path.join(dir, 'thumb.jpg')))) throw new Error(`${source.id}: нет thumb.jpg — npm run models:thumbs`);
  const entry = buildModelEntry(source, {
    author: files.author,
    file: `/assets/models/${source.id}/${files.main}`,
    thumbnail: `/assets/models/${source.id}/thumb.jpg`,
    sizeBytes: deps.reduce((sum, s) => sum + s.size, bytes.length),
    triangles: bounds.triangles,
    size: normalization.size,
  });
  return { entry, issues: validateSize(normalization.size, source.category), corrected: normalization.corrected };
}

/** Заменить в тексте манифеста только массив `models` (HDRI и текстуры остаются байт-в-байт). */
function replaceModelsSection(text, models) {
  const start = text.indexOf('"models": [');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('В manifest.json не найден раздел models');
  const body = JSON.stringify(models, null, 2).replace(/\n/g, '\n  ');
  return `${text.slice(0, start)}"models": ${body}${text.slice(end + 1)}`;
}

/** Новый текст LICENSES.md с актуальными таблицей и атрибуциями моделей. */
function renderLicenses(text, entries, sources) {
  const table = `${TABLE_HEAD}\n${renderLicenseRows(entries)}`;
  const withRows = replaceBetweenMarkers(text, MODELS_MARKERS[0], MODELS_MARKERS[1], table);
  return replaceBetweenMarkers(withRows, ATTRIBUTION_MARKERS[0], ATTRIBUTION_MARKERS[1], renderAttributions(sources));
}

/** Записать файл или (в режиме --check) сообщить, что он устарел. @returns true, если файл актуален */
async function writeOrCheck(file, next, check) {
  const current = (await readIfExists(file))?.toString('utf8');
  if (current === next) return true;
  if (check) {
    log(`Устарел: ${path.relative(ROOT, file)} — запустите npm run models:sync`);
    return false;
  }
  await writeFile(file, next);
  log(`Обновлён ${path.relative(ROOT, file)}`);
  return true;
}

/** Обработать все источники: скачать, измерить, проверить размеры. */
async function collectEntries(sources, previous, args) {
  const entries = [];
  const problems = [];
  for (const source of sources) {
    const files = await resolveFiles(source, previous.get(source.id), args);
    const { entry, issues, corrected } = await measure(source, files);
    if (corrected) log(`  ${source.id}: единицы или ось исправлены автоматически — проверьте и закрепите в normalize`);
    issues.forEach((issue) => problems.push(`${source.id}: ${formatSizeIssue(issue)}`));
    entries.push(entry);
  }
  return { entries, problems };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = parseModelsConfig(JSON.parse(await readFile(CONFIG, 'utf8')));
  const manifestText = await readFile(MANIFEST, 'utf8');
  const previous = new Map(parseManifest(JSON.parse(manifestText)).models.map((m) => [m.id, m]));
  log(`Моделей в конфигурации: ${sources.length}${args.offline ? ' (офлайн)' : ''}`);
  const { entries, problems } = await collectEntries(sources, previous, args);
  if (problems.length > 0) throw new Error(`Размеры вне диапазона категории:\n${problems.join('\n')}`);
  const nextManifest = replaceModelsSection(manifestText, entries);
  const valid = parseManifest(JSON.parse(nextManifest)).models.length;
  if (valid !== entries.length) throw new Error(`Схема манифеста отклонила ${entries.length - valid} записей`);
  const nextLicenses = renderLicenses(await readFile(LICENSES, 'utf8'), entries, sources);
  const fresh = [await writeOrCheck(MANIFEST, nextManifest, args.check), await writeOrCheck(LICENSES, nextLicenses, args.check)];
  const total = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  log(`Готово: ${entries.length} моделей, ${(total / 1048576).toFixed(1)} МБ`);
  if (!fresh.every(Boolean)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
