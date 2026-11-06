/**
 * Роль модели при расстановке:
 * - `support` — опора, на поверхности которой можно ставить предметы (столы, тумбы, комоды,
 *   стеллажи и полки, кухонные столешницы, ТВ-тумбы);
 * - `surface` — небольшой предмет, который ставится на поверхности (настольные лампы, вазы,
 *   книги, декор, маленькие растения, телевизор, техника);
 * - `floor` — обычная мебель на полу (как раньше).
 *
 * Роль определяется по ключевым словам названия (а если оно ничего не говорит — пути модели):
 * берётся главное слово фразы (последнее существительное до предлога: «ТВ-тумба с телевизором»
 * — тумба, «desk_lamp» — lamp). Поэтому новые модели библиотеки классифицируются без правок
 * каталога. Крупные «настольные» предметы остаются на полу, растения решаются по размеру.
 * @module furniture/lib/placementRole
 */

import { getModelName } from '@/shared/utils/getModelName';

/** Роль модели при расстановке. */
export type PlacementRole = 'support' | 'surface' | 'floor';

/** Что известно о модели для классификации. */
export interface RoleSubject {
  modelPath: string;
  /** Название из каталога */
  name?: string;
  /** Габариты модели при scale = 1 */
  sizes?: { halfWidth: number; halfDepth: number; height: number };
}

type Kind = 'support' | 'surface' | 'plant' | 'floor';

/** Русские основы (совпадение по началу слова, «ё» → «е»). */
const RU_STEMS: Record<Kind, readonly string[]> = {
  support: ['стол', 'тумб', 'комод', 'стеллаж', 'полк', 'полоч', 'этажерк', 'буфет', 'сервант', 'консол', 'шкаф', 'секретер', 'гарнитур', 'остров', 'бюро', 'трюмо'],
  surface: [
    'ламп', 'светильник', 'ночник', 'настольн', 'ваз', 'кувшин', 'рамк', 'фоторамк', 'книг', 'свеч', 'подсвечник', 'статуэтк',
    'фигурк', 'скульптур', 'шкатулк', 'суккулент', 'кактус', 'телевизор', 'монитор', 'ноутбук', 'компьютер', 'колонк', 'чайник',
    'микроволнов', 'кофемашин', 'тостер', 'блендер', 'тарелк', 'чашк', 'кружк', 'стакан', 'бокал', 'бутылк', 'графин', 'корзин',
    'коробк', 'поднос', 'глобус', 'будильник', 'телефон', 'принтер', 'игрушк', 'декор',
  ],
  plant: ['растени', 'цветок', 'цветы', 'цветк', 'букет', 'кашпо', 'горшок', 'горшк', 'фикус', 'пальм', 'монстер', 'орхиде', 'бонсай', 'папоротник', 'дерево', 'деревце', 'кадк'],
  floor: ['диван', 'кресл', 'стул', 'табурет', 'пуф', 'банкетк', 'кроват', 'ковр', 'ковер', 'холодильник', 'стиральн', 'посудомоечн', 'торшер', 'люстр', 'зеркал', 'вешалк', 'пианино', 'рояль'],
};

/** Английские слова (точное совпадение — пути моделей вида desk_lamp_arm_01). */
const EN_WORDS: Record<Kind, readonly string[]> = {
  support: [
    'table', 'tables', 'desk', 'desks', 'shelf', 'shelves', 'shelving', 'bookcase', 'bookcases', 'bookshelf', 'bookshelves', 'cabinet',
    'cabinets', 'cupboard', 'sideboard', 'dresser', 'commode', 'drawer', 'drawers', 'chest', 'nightstand', 'console', 'counter',
    'countertop', 'worktop', 'island', 'stand', 'credenza', 'bureau', 'vanity', 'hutch', 'wardrobe', 'closet', 'rack', 'buffet', 'etagere',
  ],
  surface: [
    'lamp', 'lamps', 'nightlight', 'vase', 'vases', 'jug', 'pitcher', 'frame', 'frames', 'photo', 'book', 'books', 'candle', 'candles',
    'candlestick', 'statue', 'statuette', 'figurine', 'sculpture', 'bust', 'succulent', 'cactus', 'tv', 'television', 'monitor', 'laptop',
    'computer', 'speaker', 'kettle', 'microwave', 'toaster', 'blender', 'coffeemaker', 'plate', 'plates', 'bowl', 'cup', 'cups', 'mug',
    'mugs', 'bottle', 'bottles', 'decanter', 'basket', 'box', 'boxes', 'tray', 'globe', 'alarm', 'phone', 'printer', 'toy', 'teapot',
    'decor', 'ornament', 'tabletop',
  ],
  plant: ['plant', 'plants', 'flower', 'flowers', 'bouquet', 'ficus', 'palm', 'monstera', 'bonsai', 'fern', 'planter', 'pot', 'tree'],
  floor: [
    'sofa', 'couch', 'armchair', 'chair', 'chairs', 'stool', 'stools', 'pouf', 'ottoman', 'bench', 'bed', 'beds', 'rug', 'carpet', 'mat',
    'fridge', 'refrigerator', 'washer', 'washing', 'dishwasher', 'mirror', 'piano', 'radiator',
  ],
};

/** Уточнения «напольный / подвесной / настенный»: такой светильник или декор не ставится на стол. */
const FLOOR_MODIFIERS = ['напольн', 'подвесн', 'потолочн', 'настенн', 'floor', 'ceiling', 'pendant', 'chandelier', 'wall', 'hanging'];

/** Предлоги: главное слово фразы стоит до них («комод со стеллажом», «chest of drawers»). */
const PREPOSITIONS = new Set(['с', 'со', 'под', 'для', 'на', 'в', 'во', 'из', 'без', 'у', 'и', 'with', 'for', 'of', 'on', 'in', 'without', 'from', 'and']);

/** Предмет для поверхности не больше этого (иначе — напольный). */
const SURFACE_MAX = { height: 1.2, half: 0.8 } as const;
/** Растение помещается на стол, если не больше этого. */
const SMALL_PLANT_MAX = { height: 0.7, half: 0.35 } as const;

const CYRILLIC = /[а-я]/;

/** Слова текста: camelCase и разделители → пробелы, нижний регистр, «ё» → «е». */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-zа-я])([A-ZА-Я])/g, '$1 $2')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/)
    .filter(Boolean);
}

function kindOfToken(token: string): Kind | null {
  const kinds = Object.keys(RU_STEMS) as Kind[];
  if (CYRILLIC.test(token)) return kinds.find((k) => RU_STEMS[k].some((stem) => token.startsWith(stem))) ?? null;
  return kinds.find((k) => EN_WORDS[k].includes(token)) ?? null;
}

const isFloorModifier = (token: string) => FLOOR_MODIFIERS.some((m) => (CYRILLIC.test(m) ? token.startsWith(m) : token === m));

/** Вид предмета по главному слову текста (null — ключевых слов нет). */
function classifyText(text: string): { kind: Kind; floorModifier: boolean } | null {
  const tokens = tokenize(text);
  const cut = tokens.findIndex((t, i) => i > 0 && PREPOSITIONS.has(t));
  const head = cut > 0 ? tokens.slice(0, cut) : tokens;
  const kind = head.map(kindOfToken).filter((k): k is Kind => k !== null).pop();
  return kind ? { kind, floorModifier: head.some(isFloorModifier) } : null;
}

const maxHalf = (s: NonNullable<RoleSubject['sizes']>) => Math.max(s.halfWidth, s.halfDepth);

/** Небольшой ли предмет (без габаритов — считаем, что да). */
function fitsSurface(sizes: RoleSubject['sizes']): boolean {
  return !sizes || (sizes.height <= SURFACE_MAX.height && maxHalf(sizes) <= SURFACE_MAX.half);
}

function isSmallPlant(sizes: RoleSubject['sizes']): boolean {
  return Boolean(sizes && sizes.height <= SMALL_PLANT_MAX.height && maxHalf(sizes) <= SMALL_PLANT_MAX.half);
}

/**
 * Роль модели при расстановке.
 * @param subject - путь, название и габариты модели
 */
export function placementRole(subject: RoleSubject): PlacementRole {
  const found = classifyText(subject.name ?? '') ?? classifyText(getModelName(subject.modelPath));
  if (!found) return 'floor';
  if (found.kind === 'support') return 'support';
  if (found.kind === 'floor' || found.floorModifier) return 'floor';
  if (found.kind === 'plant') return isSmallPlant(subject.sizes) ? 'surface' : 'floor';
  return fitsSurface(subject.sizes) ? 'surface' : 'floor';
}
