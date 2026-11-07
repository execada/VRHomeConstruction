/**
 * Нормализация габаритов моделей: реальные метры, ось «вверх» — Y, фасад к +Z.
 * Чистая математика без three.js: её используют и загрузка модели в сцену
 * (furniture/lib/modelLook), и конвейер ассетов (scripts/models), поэтому модуль
 * импортирует только типы.
 *
 * Порядок: единицы и ось «вверх» (из манифеста или автоматически по габаритам) →
 * поворот фасадом к +Z → равномерный масштаб до целевого размера → проверка
 * диапазона реальных размеров категории. Низ на полу и центр по X/Z выставляет modelLook.
 * @module furniture/lib/normalization
 */

import type { LengthUnit, ModelCategory, ModelNormalizeRule, UpAxis } from '@/features/assets/lib/manifest';

/** Габариты по осям модели: x — ширина, y — высота, z — глубина. */
export interface Size3 {
  x: number;
  y: number;
  z: number;
}

/** Диапазон [мин, макс], м. */
export type Range = readonly [number, number];

/** Правдоподобные реальные размеры: высота и больший горизонтальный габарит. */
export interface SizeRange {
  height: Range;
  footprint: Range;
}

/** Ожидаемые размеры по категориям (широкие: ловят ошибки единиц и осей, а не дизайн). */
export const CATEGORY_SIZE_RANGES: Readonly<Record<ModelCategory, SizeRange>> = {
  seating: { height: [0.3, 1.4], footprint: [0.3, 3.6] },
  tables: { height: [0.25, 1.2], footprint: [0.3, 3.2] },
  // Низ диапазона — настенная полка на кронштейнах (~20 см)
  storage: { height: [0.15, 2.7], footprint: [0.25, 3.2] },
  bedroom: { height: [0.3, 2.0], footprint: [0.3, 2.6] },
  lighting: { height: [0.05, 2.4], footprint: [0.05, 1.8] },
  decor: { height: [0.003, 2.4], footprint: [0.03, 4.0] },
  plants: { height: [0.1, 2.6], footprint: [0.08, 1.6] },
  kitchen: { height: [0.1, 2.5], footprint: [0.15, 3.6] },
  bathroom: { height: [0.3, 2.4], footprint: [0.3, 2.0] },
  appliances: { height: [0.1, 2.0], footprint: [0.1, 2.0] },
};

/** Диапазон для моделей без категории (пользовательские файлы). */
export const GENERIC_SIZE_RANGE: SizeRange = { height: [0.003, 4], footprint: [0.02, 8] };

/** Метров в единице длины. */
export const UNIT_SCALE: Readonly<Record<LengthUnit, number>> = { m: 1, cm: 0.01, mm: 0.001, dm: 0.1, in: 0.0254 };

/** Порядок проверки единиц: дюймы последними — их легко спутать с сантиметрами. */
const UNITS: readonly LengthUnit[] = ['m', 'cm', 'mm', 'dm', 'in'];
const AXES: readonly UpAxis[] = ['y', 'z'];
const DEG = Math.PI / 180;

/** Результат нормализации. */
export interface Normalization {
  unit: LengthUnit;
  upAxis: UpAxis;
  /** Итоговый равномерный масштаб (единицы × целевой размер) */
  scale: number;
  /** Поворот вокруг X, исправляющий ось «вверх», рад */
  rotationX: number;
  /** Поворот вокруг вертикали (фасад к +Z), рад */
  rotationY: number;
  /** Габариты после нормализации, м */
  size: Size3;
  /** Единицы или ось исправлены автоматически */
  corrected: boolean;
}

/** Параметры нормализации модели. */
export interface NormalizeOptions {
  category?: ModelCategory;
  rule?: ModelNormalizeRule;
}

/** Несоответствие размера ожидаемому диапазону. */
export interface SizeIssue {
  dimension: 'height' | 'footprint';
  value: number;
  range: Range;
}

const finite = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const scaled = (s: Size3, k: number): Size3 => ({ x: s.x * k, y: s.y * k, z: s.z * k });
const within = (v: number, [min, max]: Range) => v >= min && v <= max;

/**
 * Габариты после смены оси «вверх» и поворота вокруг вертикали.
 * @param raw - габариты в осях файла
 * @param upAxis - ось «вверх» файла
 * @param turnDeg - поворот вокруг вертикали, градусы (кратно 90)
 */
export function orientSize(raw: Size3, upAxis: UpAxis, turnDeg: number): Size3 {
  const upright = upAxis === 'z' ? { x: raw.x, y: raw.z, z: raw.y } : { ...raw };
  const quarter = Math.round(turnDeg / 90) % 2 !== 0;
  return quarter ? { x: upright.z, y: upright.y, z: upright.x } : upright;
}

/** Укладываются ли габариты (м) в диапазон. */
export function fitsRange(size: Size3, range: SizeRange): boolean {
  return within(size.y, range.height) && within(Math.max(size.x, size.z), range.footprint);
}

/** Первые единицы и ось, при которых модель правдоподобна (с учётом заданных в манифесте). */
function detectFrame(raw: Size3, range: SizeRange, rule: ModelNormalizeRule): { unit: LengthUnit; upAxis: UpAxis } {
  const units = rule.unit ? [rule.unit] : UNITS;
  const axes = rule.upAxis ? [rule.upAxis] : AXES;
  for (const upAxis of axes) {
    for (const unit of units) {
      if (fitsRange(scaled(orientSize(raw, upAxis, 0), UNIT_SCALE[unit]), range)) return { unit, upAxis };
    }
  }
  return { unit: rule.unit ?? 'm', upAxis: rule.upAxis ?? 'y' };
}

/** Множитель до целевого размера (1, если цели нет или габарит вырожден). */
function targetFactor(size: Size3, rule: ModelNormalizeRule): number {
  const [target, current] =
    rule.targetHeight !== undefined
      ? [rule.targetHeight, size.y]
      : rule.targetWidth !== undefined
        ? [rule.targetWidth, size.x]
        : rule.targetDepth !== undefined
          ? [rule.targetDepth, size.z]
          : [undefined, 0];
  return target !== undefined && current > 0 ? target / current : 1;
}

/**
 * Рассчитать нормализацию модели по габаритам её ограничивающего бокса.
 * Корректная модель (метры, Y вверх, без поправок) остаётся как есть.
 * @param raw - габариты в осях и единицах файла
 * @param options - категория (диапазон правдоподобных размеров) и поправки из манифеста
 */
export function resolveNormalization(raw: Size3, options: NormalizeOptions = {}): Normalization {
  const rule = options.rule ?? {};
  const clean = { x: finite(raw.x), y: finite(raw.y), z: finite(raw.z) };
  const range = options.category ? CATEGORY_SIZE_RANGES[options.category] : GENERIC_SIZE_RANGE;
  const { unit, upAxis } = detectFrame(clean, range, rule);
  const turn = rule.rotationY ?? 0;
  const inMeters = scaled(orientSize(clean, upAxis, turn), UNIT_SCALE[unit]);
  const factor = targetFactor(inMeters, rule);
  return {
    unit,
    upAxis,
    scale: UNIT_SCALE[unit] * factor,
    rotationX: upAxis === 'z' ? -Math.PI / 2 : 0,
    rotationY: turn * DEG,
    size: factor === 1 ? inMeters : scaled(inMeters, factor),
    corrected: (unit !== 'm' && !rule.unit) || (upAxis !== 'y' && !rule.upAxis),
  };
}

/** Нормализация ничего не меняет (модель уже в метрах, Y вверх, фасад к +Z). */
export function isIdentityNormalization(n: Normalization): boolean {
  return Math.abs(n.scale - 1) < 1e-9 && n.rotationX === 0 && n.rotationY === 0;
}

/**
 * Проверить габариты (м) по диапазону категории.
 * @returns список несоответствий (пустой — размеры правдоподобны)
 */
export function validateSize(size: Size3, category?: ModelCategory): SizeIssue[] {
  const range = category ? CATEGORY_SIZE_RANGES[category] : GENERIC_SIZE_RANGE;
  const footprint = Math.max(size.x, size.z);
  return [
    ...(within(size.y, range.height) ? [] : [{ dimension: 'height' as const, value: size.y, range: range.height }]),
    ...(within(footprint, range.footprint) ? [] : [{ dimension: 'footprint' as const, value: footprint, range: range.footprint }]),
  ];
}

/** Текст несоответствия для логов и предупреждений. */
export function formatSizeIssue(issue: SizeIssue): string {
  const name = issue.dimension === 'height' ? 'высота' : 'габарит в плане';
  const [min, max] = issue.range;
  return `${name} ${issue.value.toFixed(2)} м вне диапазона ${min.toFixed(2)}–${max.toFixed(2)} м`;
}
