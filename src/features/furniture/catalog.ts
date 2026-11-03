/**
 * Каталог мебели: модели из манифеста ассетов (CC0 / CC BY, реальные габариты) и
 * пользовательские модели из `public/models`. Процедурные `primitive:*` остались только
 * для старых проектов (см. LEGACY_ITEMS).
 * @module furniture/catalog
 */

import type { ModelCategory, ModelEntry } from '@/features/assets/lib/manifest';
import { getModelName } from '@/shared/utils/getModelName';
import { KNOWN_MODEL_SIZES } from './lib/knownSizes';
import { modelPaths, modelSizes } from './modelList';

/** Источник модели в каталоге. */
export type CatalogSource = 'asset' | 'primitive' | 'user';

/** Реальные габариты, м. */
export type CatalogDimensions = NonNullable<ModelEntry['dimensions']>;

/** Позиция каталога. */
export interface CatalogItem {
  /** Путь модели (сохраняется в FurnitureItem.modelPath) */
  path: string;
  name: string;
  /** Подпись категории для интерфейса */
  category: string;
  /** Стабильная категория для логики (опоры, мелкие предметы, сантехника…), см. modelCategorySchema */
  categoryId: ModelCategory;
  /** Реальные габариты, м (если известны до загрузки) */
  dimensions?: CatalogDimensions;
  source: CatalogSource;
  thumbnail?: string;
  /** Размер файла, байт (для предупреждения о тяжёлых моделях) */
  sizeBytes?: number;
  credit?: { source: string; license: string; author: string };
}

/** Категория «все». */
export const ALL_CATEGORIES = 'Все';

/** Модели тяжелее этого размера медленно грузятся (особенно в VR-шлеме). */
export const HEAVY_MODEL_BYTES = 10 * 1024 * 1024;

const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  seating: 'Сидения',
  tables: 'Столы',
  storage: 'Хранение',
  bedroom: 'Спальня',
  lighting: 'Освещение',
  plants: 'Растения',
  decor: 'Декор',
  kitchen: 'Кухня',
  bathroom: 'Ванная',
  appliances: 'Техника',
};

/** Названия пользовательских моделей по имени файла. */
const USER_MODEL_NAMES: Record<string, string> = {
  bed: 'Кровать (классика)',
  chair: 'Кресло (классика)',
  classic_table: 'Обеденный стол (классика)',
  commode: 'Комод',
  wardrobe: 'Шкаф',
  retro_vintage_furniture_pack: 'Винтажный набор',
  untitled: 'Ящик',
};

/** Процедурные модели старых проектов (без файла, см. furniture/ui/PrimitiveFurniture): вид, название, категория. */
const PRIMITIVES: ReadonlyArray<[string, string, ModelCategory]> = [
  ['sofa', 'Диван (базовый)', 'seating'],
  ['stool', 'Табурет', 'seating'],
  ['coffee_table', 'Журнальный столик (базовый)', 'tables'],
  ['desk', 'Письменный стол', 'tables'],
  ['shelf', 'Стеллаж (базовый)', 'storage'],
  ['kitchen_counter', 'Кухонная тумба', 'kitchen'],
  ['fridge', 'Холодильник', 'kitchen'],
  ['washing_machine', 'Стиральная машина', 'appliances'],
  ['tv_stand', 'ТВ-тумба с телевизором', 'appliances'],
  ['floor_lamp', 'Торшер', 'lighting'],
  ['plant', 'Дерево в кадке', 'plants'],
  ['rug', 'Ковёр', 'decor'],
  ['mirror', 'Напольное зеркало', 'decor'],
];

/** Габариты по известным размерам (половины → полные), м. */
function knownDimensions(path: string): CatalogDimensions | undefined {
  const sizes = KNOWN_MODEL_SIZES[path];
  return sizes && { width: sizes.halfWidth * 2, height: sizes.height, depth: sizes.halfDepth * 2 };
}

/**
 * Процедурные модели заменены моделями каталога (glTF с PBR-материалами). Каталог их больше
 * не предлагает, но сцена по-прежнему рендерит `primitive:*` в старых проектах (обратная
 * совместимость без миграции: позиции, повороты и размеры сохранённых предметов не меняются),
 * а инспектор показывает их название и категорию.
 */
const LEGACY_ITEMS: CatalogItem[] = PRIMITIVES.map(([kind, name, categoryId]) => {
  const path = `primitive:${kind}`;
  return { path, name, category: MODEL_CATEGORY_LABELS[categoryId], categoryId, dimensions: knownDimensions(path), source: 'primitive' };
});

/** Ключевые слова в имени файла → категория (для пользовательских моделей). */
const CATEGORY_KEYWORDS: ReadonlyArray<[RegExp, ModelCategory]> = [
  [/toilet|bath|shower|basin|sink|vanity/, 'bathroom'],
  [/fridge|refrigerator|stove|oven|hob|kitchen|counter/, 'kitchen'],
  [/\btv\b|television|washer|washing|dryer|fan/, 'appliances'],
  [/lamp|light|chandelier|sconce/, 'lighting'],
  [/plant|tree|flower|cactus/, 'plants'],
  [/nightstand|bedside|mattress|\bbed\b/, 'bedroom'],
  [/chair|sofa|couch|stool|bench|ottoman|pouf/, 'seating'],
  [/table|desk|console/, 'tables'],
  [/shel(f|ves)|cabinet|commode|wardrobe|dresser|drawer|bookcase|crate|rack|closet/, 'storage'],
];

/** Категория модели по пути файла; неизвестное — декор. */
export function guessCategory(path: string): ModelCategory {
  const name = path.toLowerCase().split('/').slice(-2).join(' ').replace(/[-_.]+/g, ' ');
  return CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'decor';
}

/** Габариты «Ш × Г × В см». */
export function formatDimensions(d: CatalogDimensions): string {
  const cm = (v: number) => Math.round(v * 100);
  return `${cm(d.width)} × ${cm(d.depth)} × ${cm(d.height)} см`;
}

function prettify(name: string): string {
  const clean = name.replace(/[-_]+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Пользовательские модели из public/models. */
const USER_ITEMS: CatalogItem[] = modelPaths.map((path) => {
  const file = getModelName(path);
  return {
    path,
    name: USER_MODEL_NAMES[file] ?? prettify(file),
    category: 'Мои модели',
    categoryId: guessCategory(path),
    source: 'user',
    sizeBytes: modelSizes[path],
  };
});

/** Позиция каталога из записи манифеста. */
function itemFromEntry(entry: ModelEntry): CatalogItem {
  return {
    path: entry.file,
    name: entry.label,
    category: MODEL_CATEGORY_LABELS[entry.category],
    categoryId: entry.category,
    dimensions: entry.dimensions,
    source: 'asset',
    thumbnail: entry.thumbnail,
    sizeBytes: entry.sizeBytes,
    credit: { source: entry.source, license: entry.license, author: entry.author },
  };
}

/**
 * Полный каталог.
 * @param entries - модели из манифеста ассетов
 */
export function buildCatalog(entries: ModelEntry[]): CatalogItem[] {
  return [...entries.map(itemFromEntry), ...USER_ITEMS];
}

/** Категории каталога в порядке появления (первая — «Все»). */
export function catalogCategories(catalog: CatalogItem[]): string[] {
  return [ALL_CATEGORIES, ...new Set(catalog.map((c) => c.category))];
}

/** Фильтр каталога по строке поиска и категории. */
export function filterCatalog(catalog: CatalogItem[], query: string, category: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  return catalog.filter(
    (c) =>
      (category === ALL_CATEGORIES || c.category === category) &&
      (!q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)),
  );
}

/** Позиция каталога по пути, включая снятые с каталога процедурные модели старых проектов. */
export function catalogEntry(catalog: CatalogItem[], path: string): CatalogItem | undefined {
  return catalog.find((c) => c.path === path) ?? LEGACY_ITEMS.find((c) => c.path === path);
}

/** Читаемое имя модели по пути. */
export function catalogName(catalog: CatalogItem[], path: string): string {
  return catalogEntry(catalog, path)?.name ?? prettify(getModelName(path));
}
