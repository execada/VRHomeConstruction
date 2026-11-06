/**
 * Наклон предмета назад (подушка у спинки дивана или лежащая на сиденье): FurnitureItem.rotation[0]
 * — поворот вокруг локальной оси X (отрицательный — верх уходит назад). Модель наклоняется вокруг
 * нижней кромки и сдвигается так, чтобы низ наклонённой подушки лежал на месте (y = позиция),
 * а занятое ей место было по центру позиции. У обычных предметов наклона нет.
 * @module editor-3d/lib/tilt
 */

/** Габариты предмета без наклона (при его масштабе). */
export interface UprightSizes {
  halfDepth: number;
  height: number;
}

/** Наклон назад, рад: 0 — стоит ровно, π/2 — лежит на спине. */
export function itemTilt(rotation: readonly [number, number, number]): number {
  return Math.min(Math.abs(rotation[0]), Math.PI / 2);
}

/**
 * Занятое место наклонённого предмета: половина глубины и высота.
 * @param sizes - габариты без наклона
 * @param tilt - наклон назад, рад
 */
export function tiltedExtent(sizes: UprightSizes, tilt: number): UprightSizes {
  if (tilt === 0) return sizes;
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  return { halfDepth: (sizes.height * sin) / 2 + sizes.halfDepth * cos, height: sizes.height * cos + sizes.halfDepth * 2 * sin };
}

/**
 * Сдвиг модели внутри поворота предмета: подъём (низ наклонённой подушки — на высоте позиции)
 * и сдвиг вперёд (занятое место — по центру позиции).
 */
export function tiltPivot(sizes: UprightSizes, tilt: number): { lift: number; shift: number } {
  if (tilt === 0) return { lift: 0, shift: 0 };
  return { lift: sizes.halfDepth * Math.sin(tilt), shift: (sizes.height * Math.sin(tilt)) / 2 };
}

/**
 * Где низ задней кромки наклонённого предмета относительно центра занятого места (вдоль фасада;
 * отрицательное — позади центра). Подушка у спинки касается её именно этой кромкой.
 */
export function backEdgeOffset(sizes: UprightSizes, tilt: number): number {
  return -sizes.halfDepth * Math.cos(tilt) + (sizes.height * Math.sin(tilt)) / 2;
}
