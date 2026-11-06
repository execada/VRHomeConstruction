/**
 * Текстиль: декоративные подушки — пухлая наволочка со швом по кромке и стянутыми к середине
 * сторонами (углы торчат, как у набитой подушки). Низ на y = 0, лицом к +Z.
 */

import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { ModelBuilder } from './geometry.mjs';
import { M } from './materials.mjs';

/** Насколько стороны стянуты к середине, доля половины размера. */
const PINCH = 0.06;
/** Профиль набивки: толщина плавно спадает к шву (меньше — пухлее). */
const FILL = 0.45;
const SEGMENTS = 28;

/**
 * Половина подушки (лицевая side = 1 или тыльная side = -1): поверхность над прямоугольником
 * width × height, на кромке толщина 0 — там шов. Обход тыльной половины зеркальный, поэтому
 * нормали обеих половин смотрят наружу.
 */
function pillowHalf(width, height, thickness, side) {
  return new ParametricGeometry(
    (u, v, target) => {
      const a = side > 0 ? u * 2 - 1 : 1 - u * 2;
      const b = v * 2 - 1;
      const x = (width / 2) * a * (1 - PINCH * (1 - b * b));
      const y = (height / 2) * (1 + b * (1 - PINCH * (1 - a * a)));
      const z = side * (thickness / 2) * Math.pow(Math.max(0, (1 - a * a) * (1 - b * b)), FILL);
      target.set(x, y, z);
    },
    SEGMENTS,
    SEGMENTS,
  );
}

/** Подушка width × height с набивкой thickness. */
function pillow(material, width, height, thickness) {
  return new ModelBuilder().add(material, pillowHalf(width, height, thickness, 1)).add(material, pillowHalf(width, height, thickness, -1));
}

/** Бархатная подушка 45 × 45 см, горчичная. */
export const pillowVelvet = () => pillow(M.velvetOchre, 0.45, 0.45, 0.14);

/** Льняная подушка 40 × 40 см, песочная. */
export const pillowLinen = () => pillow(M.linenSand, 0.4, 0.4, 0.13);
