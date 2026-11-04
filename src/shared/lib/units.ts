/**
 * Форматирование единиц плана: площадь и длина с десятичной запятой.
 * @module shared/lib/units
 */

/** Площадь: «12,4 м²». */
export function formatArea(squareMeters: number, digits = 1): string {
  return `${squareMeters.toFixed(digits).replace('.', ',')} м²`;
}

/** Длина в метрах: «3,45 м». */
export function formatMeters(meters: number, digits = 2): string {
  return `${meters.toFixed(digits).replace('.', ',')} м`;
}
