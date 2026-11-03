/**
 * Каталог мебели: качественные CC0-модели из манифеста ассетов, процедурные модели
 * (без файлов, лёгкие для VR) и пользовательские модели из `public/models`.
 * @module furniture/catalog
 */

import type { ModelCategory, ModelEntry } from '@/features/assets/lib/manifest';
import { getModelName } from '@/shared/utils/getModelName';
import { modelPaths, modelSizes } from './modelList';

/** Источник модели в каталоге. */
export type CatalogSource = 'asset' | 'primitive' | 'user';

/** Позиция каталога. */
export interface CatalogItem {
  /** Путь модели (сохраняется в FurnitureItem.modelPath) */
  path: string;
  name: string;
  category: string;
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

/** Процедурные модели (без GLB-файла, см. furniture/ui/PrimitiveFurniture). */
const PRIMITIVE_ITEMS: CatalogItem[] = [
  { path: 'primitive:sofa', name: 'Диван (базовый)', category: 'Сидения', source: 'primitive' },
  { path: 'primitive:stool', name: 'Табурет', category: 'Сидения', source: 'primitive' },
  { path: 'primitive:coffee_table', name: 'Журнальный столик (базовый)', category: 'Столы', source: 'primitive' },
  { path: 'primitive:desk', name: 'Письменный стол', category: 'Столы', source: 'primitive' },
  { path: 'primitive:shelf', name: 'Стеллаж (базовый)', category: 'Хранение', source: 'primitive' },
  { path: 'primitive:kitchen_counter', name: 'Кухонная тумба', category: 'Кухня', source: 'primitive' },
  { path: 'primitive:fridge', name: 'Холодильник', category: 'Кухня', source: 'primitive' },
  { path: 'primitive:washing_machine', name: 'Стиральная машина', category: 'Техника', source: 'primitive' },
  { path: 'primitive:tv_stand', name: 'ТВ-тумба с телевизором', category: 'Техника', source: 'primitive' },
  { path: 'primitive:floor_lamp', name: 'Торшер', category: 'Освещение', source: 'primitive' },
  { path: 'primitive:plant', name: 'Дерево в кадке', category: 'Растения', source: 'primitive' },
  { path: 'primitive:rug', name: 'Ковёр', category: 'Декор', source: 'primitive' },
  { path: 'primitive:mirror', name: 'Напольное зеркало', category: 'Декор', source: 'primitive' },
];

function prettify(name: string): string {
  const clean = name.replace(/[-_]+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Пользовательские модели из public/models. */
const USER_ITEMS: CatalogItem[] = modelPaths.map((path) => {
  const file = getModelName(path);
  return { path, name: USER_MODEL_NAMES[file] ?? prettify(file), category: 'Мои модели', source: 'user', sizeBytes: modelSizes[path] };
});

/** Позиция каталога из записи манифеста. */
function itemFromEntry(entry: ModelEntry): CatalogItem {
  return {
    path: entry.file,
    name: entry.label,
    category: MODEL_CATEGORY_LABELS[entry.category],
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
  return [...entries.map(itemFromEntry), ...PRIMITIVE_ITEMS, ...USER_ITEMS];
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

/** Читаемое имя модели по пути. */
export function catalogName(catalog: CatalogItem[], path: string): string {
  return catalog.find((c) => c.path === path)?.name ?? prettify(getModelName(path));
}
