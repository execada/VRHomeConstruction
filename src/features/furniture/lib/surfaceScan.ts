/**
 * Поиск горизонтальных поверхностей модели: столешница, крышка тумбы, каждая полка стеллажа.
 *
 * Над моделью строится сетка (шаг 1–4 см), и в каждом узле сверху вниз бросается вертикальный
 * луч на настоящие треугольники модели. Для скорости это делается обратным ходом —
 * растеризацией треугольников в сетку (результат тот же, что у лучей в узлах, но за один
 * проход по геометрии). Почти горизонтальные грани, смотрящие вверх, — уровни; свободная
 * высота над уровнем — расстояние до следующей детали над ним (например, полки выше).
 * Уровни одной высоты объединяются, и в каждом выбираются наибольшие свободные прямоугольники.
 * @module furniture/lib/surfaceScan
 */

/** Горизонтальная поверхность модели в её нормализованных координатах (scale = 1). */
export interface ModelSurface {
  /** Высота поверхности над низом модели, м */
  y: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Свободная высота над поверхностью до следующей детали (Infinity — сверху ничего нет), м */
  clearance: number;
}

const GRID_SAMPLES = 80;
const CELL_MIN = 0.008;
const CELL_MAX = 0.04;
/** Грань считается горизонтальной, если её нормаль отклонена от вертикали меньше чем на ~16°. */
const LEVEL_COS = 0.96;
/** Более крутые грани (стенки) вертикальный луч почти не задевает — их пропускаем. */
const BLOCKING_COS = 0.2;
/** Меньший просвет — это стык деталей, а не место для предмета. */
const MIN_CLEARANCE = 0.05;
/** Меньшая сторона поверхности — кромка или торец, а не полка. */
const MIN_SIDE = 0.08;
const LEVEL_TOLERANCE = 0.012;
const RECTS_PER_PASS = 4;
const MAX_SURFACES = 24;
const SAME_HEIGHT = 1e-4;

interface Grid {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cell: number;
  nx: number;
  nz: number;
}

/** Пересечение луча узла с гранью: высота и косинус наклона нормали к вертикали. */
interface Hit {
  y: number;
  cos: number;
}

interface CellLevel {
  y: number;
  clearance: number;
}

interface CellRect {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

interface Cluster {
  lo: number;
  hi: number;
}

/** Сетка над габаритами треугольников (null — геометрии нет). */
function gridFor(p: ArrayLike<number>): Grid | null {
  if (p.length < 9) return null;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k + 2 < p.length; k += 3) {
    bounds.minX = Math.min(bounds.minX, p[k]);
    bounds.maxX = Math.max(bounds.maxX, p[k]);
    bounds.minZ = Math.min(bounds.minZ, p[k + 2]);
    bounds.maxZ = Math.max(bounds.maxZ, p[k + 2]);
  }
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  if (!(size > 0)) return null;
  const cell = Math.min(CELL_MAX, Math.max(CELL_MIN, size / GRID_SAMPLES));
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  return { ...bounds, cell, nx, nz };
}

/** Косинус между нормалью треугольника и вертикалью (null — вырожденный треугольник). */
function triangleCos(p: ArrayLike<number>, o: number): number | null {
  const ux = p[o + 3] - p[o];
  const uy = p[o + 4] - p[o + 1];
  const uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o];
  const vy = p[o + 7] - p[o + 1];
  const vz = p[o + 8] - p[o + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length < 1e-12 ? null : ny / length;
}

const cellRange = (min: number, max: number, origin: number, cell: number, count: number): [number, number] => [
  Math.max(0, Math.ceil((min - origin) / cell - 0.5)),
  Math.min(count - 1, Math.floor((max - origin) / cell - 0.5)),
];

/** Записать пересечения вертикальных лучей узлов с треугольником (offset o — начало его 9 чисел). */
function addTriangleHits(p: ArrayLike<number>, o: number, grid: Grid, hits: Hit[][]): void {
  const cos = triangleCos(p, o);
  if (cos === null || Math.abs(cos) < BLOCKING_COS) return;
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => p[o + k]);
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return;
  const [i0, i1] = cellRange(Math.min(ax, bx, cx), Math.max(ax, bx, cx), grid.minX, grid.cell, grid.nx);
  const [j0, j1] = cellRange(Math.min(az, bz, cz), Math.max(az, bz, cz), grid.minZ, grid.cell, grid.nz);
  for (let j = j0; j <= j1; j += 1) {
    const pz = grid.minZ + (j + 0.5) * grid.cell;
    for (let i = i0; i <= i1; i += 1) {
      const px = grid.minX + (i + 0.5) * grid.cell;
      const w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
      const w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
      const w3 = 1 - w1 - w2;
      if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9) hits[j * grid.nx + i].push({ y: w1 * ay + w2 * by + w3 * cy, cos });
    }
  }
}

/** Пересечения лучей всех узлов с геометрией, отсортированные сверху вниз. */
function castGrid(p: ArrayLike<number>, grid: Grid): Hit[][] {
  const hits: Hit[][] = Array.from({ length: grid.nx * grid.nz }, () => []);
  for (let o = 0; o + 8 < p.length; o += 9) addTriangleHits(p, o, grid, hits);
  return hits.map((list) => [...list].sort((a, b) => b.y - a.y));
}

/**
 * Перевёрнуты ли нормали модели: самая верхняя грань в большинстве узлов «смотрит вниз».
 * Тогда уровнями считаются грани с нормалью вниз (иначе модель осталась бы без полок).
 */
function normalsFlipped(hits: Hit[][]): boolean {
  const tops = hits.filter((list) => list.length > 0 && Math.abs(list[0].cos) >= LEVEL_COS);
  return tops.filter((list) => list[0].cos < 0).length > tops.length / 2;
}

/** Уровни узла: горизонтальные грани, смотрящие вверх, со свободной высотой над ними. */
function cellLevels(hits: Hit[], flipped: boolean): CellLevel[] {
  return hits.flatMap((hit, index) => {
    const facesUp = flipped ? hit.cos <= -LEVEL_COS : hit.cos >= LEVEL_COS;
    const topmost = hit.y >= hits[0].y - SAME_HEIGHT && Math.abs(hit.cos) >= LEVEL_COS;
    if (!facesUp && !topmost) return [];
    let above = Infinity;
    for (let k = index - 1; k >= 0 && above === Infinity; k -= 1) {
      if (hits[k].y > hit.y + SAME_HEIGHT) above = hits[k].y;
    }
    const clearance = above - hit.y;
    return clearance >= MIN_CLEARANCE ? [{ y: hit.y, clearance }] : [];
  });
}

/** Сгруппировать высоты уровней (разница не больше LEVEL_TOLERANCE — один уровень). */
function clusterHeights(levels: CellLevel[][]): Cluster[] {
  const heights = levels.flatMap((list) => list.map((l) => l.y)).sort((a, b) => a - b);
  return heights.reduce<Cluster[]>((acc, y) => {
    const last = acc[acc.length - 1];
    if (last && y - last.lo <= LEVEL_TOLERANCE) return [...acc.slice(0, -1), { lo: last.lo, hi: y }];
    return [...acc, { lo: y, hi: y }];
  }, []);
}

/** Свободная высота узла на уровне (null — узел не принадлежит уровню). */
function clearanceAt(levels: CellLevel[], cluster: Cluster): number | null {
  const own = levels.filter((l) => l.y >= cluster.lo - 1e-9 && l.y <= cluster.hi + 1e-9);
  return own.length > 0 ? Math.min(...own.map((l) => l.clearance)) : null;
}

/** Наибольший прямоугольник гистограммы строки j, не меньше minCols × minRows. */
function bestInRow(heights: number[], j: number, min: [number, number], best: (CellRect & { area: number }) | null) {
  const stack: number[] = [];
  let result = best;
  for (let i = 0; i <= heights.length; i += 1) {
    const h = i < heights.length ? heights[i] : 0;
    while (stack.length > 0 && heights[stack[stack.length - 1]] >= h) {
      const height = heights[stack.pop() as number];
      const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
      const width = i - left;
      if (width >= min[0] && height >= min[1] && (!result || width * height > result.area)) {
        result = { i0: left, i1: i - 1, j0: j - height + 1, j1: j, area: width * height };
      }
    }
    stack.push(i);
  }
  return result;
}

/** Наибольший прямоугольник из отмеченных узлов (не меньше min = [столбцов, строк]). */
function largestRect(mask: readonly boolean[], grid: Grid, min: [number, number]): CellRect | null {
  const heights = new Array<number>(grid.nx).fill(0);
  let best: (CellRect & { area: number }) | null = null;
  for (let j = 0; j < grid.nz; j += 1) {
    for (let i = 0; i < grid.nx; i += 1) heights[i] = mask[j * grid.nx + i] ? heights[i] + 1 : 0;
    best = bestInRow(heights, j, min, best);
  }
  return best && { i0: best.i0, i1: best.i1, j0: best.j0, j1: best.j1 };
}

const inRect = (i: number, j: number, r: CellRect) => i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1;

/** Несколько наибольших непересекающихся прямоугольников маски. */
function extractRects(mask: readonly boolean[], grid: Grid): CellRect[] {
  const min: [number, number] = [Math.ceil(MIN_SIDE / grid.cell - 1e-9), Math.ceil(MIN_SIDE / grid.cell - 1e-9)];
  const rects: CellRect[] = [];
  let remaining = mask;
  for (let k = 0; k < RECTS_PER_PASS; k += 1) {
    const rect = largestRect(remaining, grid, min);
    if (!rect) break;
    rects.push(rect);
    remaining = remaining.map((v, idx) => v && !inRect(idx % grid.nx, Math.floor(idx / grid.nx), rect));
  }
  return rects;
}

/**
 * Прямоугольник узлов → поверхность в метрах. Внутренние края — по центрам крайних узлов
 * (предмет не свисает за кромку и не задевает соседнюю деталь), края у габарита модели — по габариту.
 */
function toSurface(rect: CellRect, grid: Grid, y: number, clearance: number): ModelSurface {
  const center = (origin: number, index: number) => origin + (index + 0.5) * grid.cell;
  return {
    y,
    minX: rect.i0 === 0 ? grid.minX : center(grid.minX, rect.i0),
    maxX: rect.i1 === grid.nx - 1 ? grid.maxX : center(grid.minX, rect.i1),
    minZ: rect.j0 === 0 ? grid.minZ : center(grid.minZ, rect.j0),
    maxZ: rect.j1 === grid.nz - 1 ? grid.maxZ : center(grid.minZ, rect.j1),
    clearance,
  };
}

/** Наименьшая свободная высота в прямоугольнике узлов. */
function rectClearance(clearances: ReadonlyArray<number | null>, rect: CellRect, grid: Grid): number {
  let clearance = Infinity;
  for (let j = rect.j0; j <= rect.j1; j += 1) {
    for (let i = rect.i0; i <= rect.i1; i += 1) clearance = Math.min(clearance, clearances[j * grid.nx + i] ?? Infinity);
  }
  return clearance;
}

/**
 * Поверхности одного уровня: по всем узлам и, если часть уровня перекрыта сверху
 * (экран над ТВ-тумбой, полка над столом), отдельно — по открытым узлам для высоких предметов.
 */
function clusterSurfaces(levels: CellLevel[][], grid: Grid, cluster: Cluster): ModelSurface[] {
  const all = levels.map((list) => clearanceAt(list, cluster));
  const covered = all.some((c) => c !== null && c !== Infinity);
  const passes = covered ? [all, all.map((c) => (c === Infinity ? c : null))] : [all];
  return passes.flatMap((clearances) =>
    extractRects(
      clearances.map((c) => c !== null),
      grid,
    ).map((rect) => toSurface(rect, grid, cluster.hi, rectClearance(clearances, rect, grid))),
  );
}

const area = (s: ModelSurface) => (s.maxX - s.minX) * (s.maxZ - s.minZ);

/**
 * Найти горизонтальные поверхности модели.
 * @param positions - треугольники подряд по 9 чисел (x, y, z трёх вершин) в нормализованных
 *   координатах модели: низ на y = 0, центр по X/Z, scale = 1
 * @returns поверхности сверху вниз (пустой список — поверхностей нет)
 */
export function scanSurfaces(positions: ArrayLike<number>): ModelSurface[] {
  const grid = gridFor(positions);
  if (!grid) return [];
  const hits = castGrid(positions, grid);
  const flipped = normalsFlipped(hits);
  const levels = hits.map((list) => cellLevels(list, flipped));
  const minCells = Math.ceil(MIN_SIDE / grid.cell) ** 2;
  return clusterHeights(levels)
    .filter((cluster) => levels.filter((list) => clearanceAt(list, cluster) !== null).length >= minCells)
    .flatMap((cluster) => clusterSurfaces(levels, grid, cluster))
    .sort((a, b) => b.y - a.y || area(b) - area(a))
    .slice(0, MAX_SURFACES);
}
