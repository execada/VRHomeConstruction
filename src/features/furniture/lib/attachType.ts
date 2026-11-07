/**
 * Тип крепления модели (`attachType`): `floor` — стоит на полу, `wall` — висит на стене
 * (картины, зеркала, часы, полки, кондиционеры, подвесная сантехника), `ceiling` — под потолком
 * (люстры, подвесные и потолочные светильники), `surface` — ставится на столешницы и полки.
 * У моделей каталога тип и высота подвеса заданы в манифесте; у своих моделей тип узнаётся
 * по названию («настенный», «картина», «люстра», wall, sconce, chandelier…), иначе — по роли
 * при расстановке (небольшие предметы — на поверхности, остальное — на полу).
 * @module furniture/lib/attachType
 */

import { getModelName } from '@/shared/utils/getModelName';
import { modelProfile } from './modelProfiles';
import { placementRole, tokenize, type RoleSubject } from './placementRole';

/** Тип крепления. */
export type AttachType = 'floor' | 'wall' | 'ceiling' | 'surface';

/** Высота центра настенного предмета над полом по умолчанию (картины — на уровне глаз), м. */
export const DEFAULT_MOUNT_HEIGHT = 1.5;

const CYRILLIC = /[а-я]/;

/** Потолок: русские основы и английские слова. */
const CEILING = { stems: ['потолочн', 'люстр'], words: ['ceiling', 'chandelier', 'pendant'] };
/** Стена. */
const WALL = {
  stems: ['настенн', 'картин', 'постер', 'плакат', 'бра', 'кондиционер', 'панно', 'гобелен'],
  words: ['wall', 'painting', 'poster', 'sconce', 'artwork', 'tapestry', 'mounted', 'conditioner', 'aircon'],
};
/** «Подвесной» — под потолком только у светильников (подвесная раковина висит на стене). */
const HANGING = ['подвесн', 'hanging'];
const LIGHT = ['светильник', 'ламп', 'люстр', 'lamp', 'light', 'lights'];

const has = (tokens: readonly string[], list: { stems: readonly string[]; words: readonly string[] }) =>
  tokens.some((t) => (CYRILLIC.test(t) ? list.stems.some((s) => t.startsWith(s)) : list.words.includes(t)));
const hasAny = (tokens: readonly string[], prefixes: readonly string[]) => tokens.some((t) => prefixes.some((p) => t.startsWith(p)));

/** Тип крепления по словам текста (null — слова о креплении не встречаются). */
function mountByWords(text: string): 'wall' | 'ceiling' | null {
  const tokens = tokenize(text);
  if (has(tokens, CEILING) || (hasAny(tokens, HANGING) && hasAny(tokens, LIGHT))) return 'ceiling';
  if (has(tokens, WALL) || hasAny(tokens, HANGING)) return 'wall';
  return null;
}

/**
 * Тип крепления модели.
 * @param subject - путь, название и габариты модели
 */
export function attachType(subject: RoleSubject): AttachType {
  const profile = modelProfile(subject.modelPath);
  if (profile?.attach) return profile.attach;
  if (!profile) {
    const mount = mountByWords(subject.name ?? '') ?? mountByWords(getModelName(subject.modelPath));
    if (mount) return mount;
  }
  return placementRole(subject) === 'surface' ? 'surface' : 'floor';
}

/**
 * Высота центра настенного предмета над полом при установке (из манифеста или по умолчанию), м.
 * @param modelPath - путь модели
 */
export function mountHeight(modelPath: string): number {
  return modelProfile(modelPath)?.mountHeight ?? DEFAULT_MOUNT_HEIGHT;
}
