/**
 * Форматирование значений инспектора.
 * @module widgets/editor-inspector/lib/format
 */

/** Перевод метров в «123 см». */
export const cm = (meters: number) => `${Math.round(meters * 100)} см`;

/** Перевод радиан в градусы (−180..180). */
export const toDegrees = (radians: number) => {
  const deg = (radians * 180) / Math.PI;
  return Math.round(((((deg + 180) % 360) + 360) % 360) - 180);
};

/** Перевод градусов в радианы. */
export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
