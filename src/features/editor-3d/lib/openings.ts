/**
 * Логика проёмов (окон и дверей): размеры по умолчанию, ограничения,
 * отступ от пола, перемещение вдоль стены без наложения на соседние проёмы
 * и на стыки с другими стенами. Окна могут быть панорамными: от пола до потолка
 * и почти во всю длину стены. Все функции чистые и возвращают новые объекты.
 * @module editor-3d/lib/openings
 */

import { clamp } from '@/shared/lib/math/geometry2d';
import { freeIntervals } from './walls';
import type { Opening } from '../types';

/** Стена/перегородка, на которой расположен проём. */
export interface OpeningHost {
  /** Длина рабочей грани, м */
  length: number;
  /** Высота, м */
  height: number;
  /** Участки вдоль стены, занятые стыками с другими стенами (проём туда не заходит) */
  blocked?: ReadonlyArray<readonly [number, number]>;
}

/** Размеры проёмов по умолчанию. */
export const OPENING_DEFAULTS: Record<Opening['type'], { width: number; height: number; sill: number }> = {
  window: { width: 1.2, height: 1.4, sill: 0.9 },
  door: { width: 0.9, height: 2.1, sill: 0 },
};

/** Ограничения размеров и положения проёмов, м. */
export const OPENING_LIMITS = {
  minWidth: 0.4,
  /** Панорамное остекление — почти во всю длину стены */
  maxWidth: 20,
  minHeight: 0.4,
  /** Отступ проёма от торцов стены и от стыков с другими стенами */
  edgeMargin: 0.1,
  /** Минимальный простенок между проёмами */
  gap: 0.1,
  /** Минимальная перемычка над проёмом (0 — проём до потолка) */
  topMargin: 0,
  /** Минимальный подоконник окна (0 — панорамное окно от пола) */
  minWindowSill: 0,
} as const;

/** Отступ проёма от пола (низ проёма). */
export function openingSill(opening: Opening): number {
  return opening.position[1] - opening.height / 2;
}

/** Копия проёма с другим отступом от пола (центр пересчитывается). */
export function withSill(opening: Opening, sill: number): Opening {
  return { ...opening, position: [opening.position[0], sill + opening.height / 2] };
}

const minSill = (type: Opening['type']) => (type === 'door' ? 0 : OPENING_LIMITS.minWindowSill);

/** Ограничить ширину и высоту проёма размерами стены. */
export function clampOpeningSize(opening: Opening, host: OpeningHost): Opening {
  const maxWidth = Math.max(OPENING_LIMITS.minWidth, Math.min(OPENING_LIMITS.maxWidth, host.length - OPENING_LIMITS.edgeMargin * 2));
  const maxHeight = Math.max(OPENING_LIMITS.minHeight, host.height - minSill(opening.type) - OPENING_LIMITS.topMargin);
  const width = clamp(opening.width, OPENING_LIMITS.minWidth, maxWidth);
  const height = clamp(opening.height, OPENING_LIMITS.minHeight, maxHeight);
  const sill = openingSill(opening);
  return withSill({ ...opening, width, height }, sill);
}

/** Допустимый диапазон центра проёма вдоль стены. */
export function openingCenterRange(width: number, host: OpeningHost): [number, number] {
  const half = host.length / 2 - OPENING_LIMITS.edgeMargin - width / 2;
  return half >= 0 ? [-half, half] : [0, 0];
}

/** Допустимый диапазон отступа от пола. */
export function openingSillRange(opening: Pick<Opening, 'type' | 'height'>, host: OpeningHost): [number, number] {
  if (opening.type === 'door') return [0, 0];
  const max = Math.max(minSill('window'), host.height - opening.height - OPENING_LIMITS.topMargin);
  return [minSill('window'), max];
}

/**
 * Полностью нормализовать проём: размеры, отступ от пола и положение вдоль стены.
 * Соседние проёмы не учитываются (см. {@link moveOpening}).
 */
export function clampOpening(opening: Opening, host: OpeningHost): Opening {
  const sized = clampOpeningSize(opening, host);
  const [uMin, uMax] = openingCenterRange(sized.width, host);
  const [sMin, sMax] = openingSillRange(sized, host);
  const sill = clamp(openingSill(sized), sMin, sMax);
  return withSill({ ...sized, position: [clamp(sized.position[0], uMin, uMax), sized.position[1]] }, sill);
}

/**
 * Допуск касания: проём может стоять вплотную к соседу (простенок ровно `gap`).
 * Занятые интервалы сужаются на эту величину, проверка наложения её прощает.
 */
const TOUCH_EPS = 1e-5;

/** Пересекаются ли два проёма по горизонтали (с учётом простенка). */
export function openingsOverlap(a: Opening, b: Opening, gap: number = OPENING_LIMITS.gap): boolean {
  return Math.abs(a.position[0] - b.position[0]) < (a.width + b.width) / 2 + gap - TOUCH_EPS * 10;
}

/** Свободные интервалы для центра проёма заданной ширины. */
function freeCenterIntervals(width: number, host: OpeningHost, others: Opening[]): Array<[number, number]> {
  const [uMin, uMax] = openingCenterRange(width, host);
  const reach = width / 2 + OPENING_LIMITS.edgeMargin - TOUCH_EPS;
  const blocked = [
    ...others.map((o) => {
      const r = (o.width + width) / 2 + OPENING_LIMITS.gap - TOUCH_EPS;
      return [o.position[0] - r, o.position[0] + r] as const;
    }),
    ...(host.blocked ?? []).map(([a, b]) => [a - reach, b + reach] as const),
  ];
  if (uMax - uMin > 1e-9) return freeIntervals(uMin, uMax, blocked);
  // Проём во всю допустимую ширину стены: единственная позиция — центр.
  const isBlocked = blocked.some(([a, b]) => uMin > a + 1e-9 && uMin < b - 1e-9);
  return isBlocked ? [] : [[uMin, uMin]];
}

/**
 * Ближайшая к желаемой свободная позиция центра проёма.
 * @returns координата u или null, если места на стене нет
 */
export function nearestFreeCenter(target: number, width: number, host: OpeningHost, others: Opening[]): number | null {
  const intervals = freeCenterIntervals(width, host, others);
  if (intervals.length === 0) return null;
  return intervals
    .map(([a, b]) => clamp(target, a, b))
    .reduce((best, u) => (Math.abs(u - target) < Math.abs(best - target) ? u : best));
}

/**
 * Переместить проём (перетаскивание в 2D/3D): центр «упирается» в соседние проёмы
 * и края стены, отступ от пола ограничивается допустимым диапазоном.
 * @param opening - исходный проём
 * @param target - желаемые координаты центра {u, y}
 * @param host - стена
 * @param others - остальные проёмы этой стены
 */
export function moveOpening(opening: Opening, target: { u: number; y: number }, host: OpeningHost, others: Opening[]): Opening {
  const sized = clampOpeningSize(opening, host);
  const u = nearestFreeCenter(target.u, sized.width, host, others);
  const [sMin, sMax] = openingSillRange(sized, host);
  const sill = clamp(target.y - sized.height / 2, sMin, sMax);
  return withSill({ ...sized, position: [u ?? sized.position[0], sized.position[1]] }, sill);
}

/**
 * Изменить размеры проёма с сохранением отступа от пола и без наложения на соседей.
 * Если новая ширина не помещается рядом с соседями — ширина ограничивается.
 */
export function resizeOpening(
  opening: Opening,
  size: { width?: number; height?: number },
  host: OpeningHost,
  others: Opening[],
): Opening {
  const resized = clampOpeningSize(
    withSill({ ...opening, width: size.width ?? opening.width, height: size.height ?? opening.height }, openingSill(opening)),
    host,
  );
  const fits = nearestFreeCenter(resized.position[0], resized.width, host, others);
  if (fits !== null) return moveOpening(resized, { u: fits, y: resized.position[1] }, host, others);
  return clampOpening(opening, host);
}

/**
 * Создать проём со стандартными размерами в ближайшем свободном месте стены.
 * @returns новый проём или null, если на стене нет места
 */
export function createOpening(params: {
  id: string;
  type: Opening['type'];
  wallId: string;
  host: OpeningHost;
  others: Opening[];
  preferredU?: number;
}): Opening | null {
  const { id, type, wallId, host, others, preferredU = 0 } = params;
  const defaults = OPENING_DEFAULTS[type];
  const draft = clampOpening(
    withSill({ id, wallId, type, position: [preferredU, 0], width: defaults.width, height: defaults.height }, defaults.sill),
    host,
  );
  const u = nearestFreeCenter(preferredU, draft.width, host, others);
  return u === null ? null : { ...draft, position: [u, draft.position[1]] };
}

/**
 * Привести набор проёмов стены к допустимому виду (после изменения размеров комнаты):
 * каждый проём нормализуется, а не помещающиеся проёмы удаляются.
 */
export function normalizeWallOpenings(openings: Opening[], host: OpeningHost): Opening[] {
  return [...openings]
    .sort((a, b) => a.position[0] - b.position[0])
    .reduce<Opening[]>((placed, opening) => {
      const clamped = clampOpening(opening, host);
      const u = nearestFreeCenter(clamped.position[0], clamped.width, host, placed);
      return u === null ? placed : [...placed, { ...clamped, position: [u, clamped.position[1]] }];
    }, []);
}
