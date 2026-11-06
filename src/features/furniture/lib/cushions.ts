/**
 * Подушки и посадочные места диванов и кресел: какая модель — подушка, какие у модели места
 * для подушек (у спинки и на сиденье). Сведения берутся из манифеста каталога; для своих
 * моделей и старых процедурных — по названию (диван, кресло, подушка) и габаритам: места
 * раскладываются по ширине сиденья между подлокотниками.
 * @module furniture/lib/cushions
 */

import { getModelName } from '@/shared/utils/getModelName';
import { modelProfile } from './modelProfiles';
import type { ModelSizes } from './modelLook';
import { tokenize } from './placementRole';

/** Вид посадочного места: у спинки (подушка опирается на неё) или на сиденье (лежит). */
export type SocketKind = 'back' | 'seat';

/** Посадочное место в нормализованных координатах модели (scale = 1, фасад к +Z). */
export interface CushionSocket {
  id: string;
  kind: SocketKind;
  /** back — точка касания низа задней кромки подушки со спинкой; seat — центр лежащей подушки, м */
  position: readonly [number, number, number];
  /** Поворот подушки вокруг вертикали от фасада модели, рад */
  yaw: number;
  /** Наклон подушки назад, рад (0 — стоит ровно, π/2 — лежит) */
  tilt: number;
}

/** Как подушка садится на места. */
export interface CushionStyle {
  /** Модель уже стоит с наклоном (набор подушек): только к спинке и без дополнительного наклона */
  upright: boolean;
}

/** Что известно о модели. */
export interface CushionSubject {
  modelPath: string;
  name?: string;
  /** Габариты при scale = 1 (для мест своих моделей) */
  sizes?: ModelSizes;
}

/** Наклон подушки у спинки по умолчанию: опирается на неё. */
export const BACK_TILT = (15 * Math.PI) / 180;
/** Подушка на сиденье лежит. */
export const SEAT_TILT = Math.PI / 2;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const CUSHION_STEMS = ['подушк', 'подушечк', 'думочк'];
const CUSHION_WORDS = ['pillow', 'pillows', 'cushion', 'cushions'];
const HOST_STEMS = ['диван', 'кресл', 'софа', 'кушетк', 'тахт', 'канапе'];
const HOST_WORDS = ['sofa', 'sofas', 'couch', 'couches', 'armchair', 'armchairs', 'loveseat', 'settee'];

const CYRILLIC = /[а-я]/;

/** Есть ли в тексте слово из списка (русские — по началу слова, английские — целиком). */
function mentions(text: string, stems: readonly string[], words: readonly string[]): boolean {
  return tokenize(text).some((t) => (CYRILLIC.test(t) ? stems.some((s) => t.startsWith(s)) : words.includes(t)));
}

const describes = (subject: CushionSubject, stems: readonly string[], words: readonly string[]) =>
  mentions(subject.name ?? '', stems, words) || mentions(getModelName(subject.modelPath), stems, words);

/**
 * Подушка ли модель и как она садится (null — не подушка).
 * @param subject - путь и название модели
 */
export function cushionStyle(subject: CushionSubject): CushionStyle | null {
  const profile = modelProfile(subject.modelPath);
  if (profile) return profile.cushion ? { upright: Boolean(profile.cushion.upright) } : null;
  return describes(subject, CUSHION_STEMS, CUSHION_WORDS) ? { upright: false } : null;
}

/** Раскладка мест своей модели по габаритам. */
const FALLBACK = {
  /** Высота сиденья — доля высоты модели, м (не ниже и не выше разумного) */
  seatShare: 0.5,
  seatHeight: [0.3, 0.6],
  /** Подлокотники с каждой стороны — доля ширины */
  armShare: 0.1,
  /** Спинка — доля глубины от задней стенки */
  backShare: 0.28,
  /** Шаг мест у спинки и на сиденье, м */
  backStep: 0.42,
  seatStep: 0.6,
  maxBack: 4,
  maxSeat: 3,
  /** Центр лежащей подушки — перед спинкой, м */
  seatAhead: 0.3,
} as const;

/** Места по ширине сиденья: центры count отрезков. */
function spread(inner: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => -inner / 2 + (inner * (i + 0.5)) / count);
}

/**
 * Места своей модели дивана или кресла по её габаритам (без описания в манифесте).
 * @param sizes - габариты при scale = 1
 */
export function fallbackSockets(sizes: ModelSizes): CushionSocket[] {
  const inner = sizes.halfWidth * 2 * (1 - FALLBACK.armShare * 2);
  const y = Math.min(FALLBACK.seatHeight[1], Math.max(FALLBACK.seatHeight[0], sizes.height * FALLBACK.seatShare));
  const backZ = -sizes.halfDepth + sizes.halfDepth * 2 * FALLBACK.backShare;
  const seatZ = Math.min(backZ + FALLBACK.seatAhead, sizes.halfDepth - 0.2);
  const count = (step: number, max: number) => Math.min(max, Math.max(1, Math.floor(inner / step)));
  const back = spread(inner, count(FALLBACK.backStep, FALLBACK.maxBack)).map(
    (x, i): CushionSocket => ({ id: `back-${i + 1}`, kind: 'back', position: [x, y, backZ], yaw: 0, tilt: BACK_TILT }),
  );
  const seat = spread(inner, count(FALLBACK.seatStep, FALLBACK.maxSeat)).map(
    (x, i): CushionSocket => ({ id: `seat-${i + 1}`, kind: 'seat', position: [x, y, seatZ], yaw: 0, tilt: SEAT_TILT }),
  );
  return [...back, ...seat];
}

/**
 * Посадочные места модели: из манифеста, а для своих диванов и кресел — по габаритам.
 * @param subject - путь, название и габариты модели
 * @returns пустой список — у модели мест нет
 */
export function cushionSockets(subject: CushionSubject): CushionSocket[] {
  const profile = modelProfile(subject.modelPath);
  if (profile) {
    return (profile.sockets ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      position: s.position,
      yaw: toRadians(s.yaw ?? 0),
      tilt: s.tilt === undefined ? (s.kind === 'back' ? BACK_TILT : SEAT_TILT) : toRadians(s.tilt),
    }));
  }
  if (!subject.sizes || cushionStyle(subject) || !describes(subject, HOST_STEMS, HOST_WORDS)) return [];
  return fallbackSockets(subject.sizes);
}
