/**
 * Встроенные шаблоны комнат («Готовый макет»): реальные CC0-модели и PBR-текстуры.
 * Каждый шаблон — документ сцены v2; корректность (всё внутри комнаты, без наложений)
 * проверяется тестом builtins.test.ts.
 * @module templates/lib/builtins
 */

import { MODELS } from '@/features/furniture/lib/knownSizes';
import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import { DEFAULT_LIGHT } from '@/features/editor-3d/constants';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import type { Partition, RoomDimensions } from '@/features/editor-3d/types';
import { againstWall, allWalls, doorOn, finish, itemAt, windowOn } from './compose';

/** Встроенный шаблон. */
export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  /** Площадь для подписи, м² */
  area: number;
  build: () => SceneDocument;
}

/** Базовый документ с размерами и отделкой. */
function base(dims: RoomDimensions, floorTexture: string, wallColor: string): SceneDocument {
  const empty = createEmptyScene(dims);
  return {
    ...empty,
    finishes: {
      floor: finish(floorTexture),
      ceiling: finish(null, '#fbfaf7'),
      walls: allWalls(finish(null, wallColor)),
    },
    light: { ...DEFAULT_LIGHT, temperature: 3000, intensity: 1.4 },
  };
}

const living = (): SceneDocument => {
  const dims = { width: 5, height: 2.8, depth: 4.2 };
  return {
    ...base(dims, 'herringbone_parquet', '#efe8de'),
    environment: { ...DEFAULT_ENVIRONMENT, sun: { ...DEFAULT_ENVIRONMENT.sun, timeOfDay: 15.5 } },
    openings: [windowOn('w1', 'front', -1.25, 1.5, 1.6, 0.7), windowOn('w2', 'front', 1.25, 1.5, 1.6, 0.7), doorOn('d1', 'back', 1.8)],
    furniture: [
      againstWall('sofa', MODELS.sofa, dims, 'left', 0, { name: 'Диван' }),
      itemAt('coffee', MODELS.coffeeTable, [-1.1, 0], { name: 'Журнальный столик' }),
      itemAt('rug', 'primitive:rug', [-0.9, 0], { name: 'Ковёр', angle: Math.PI / 2 }),
      againstWall('tv', MODELS.tvCabinet, dims, 'right', 0, { name: 'ТВ-тумба' }),
      itemAt('armchair', MODELS.armchair, [-1.6, 1.4], { name: 'Кресло', angle: Math.PI / 2 }),
      itemAt('plant', MODELS.plantTall, [2.1, 1.75], { name: 'Растение в кашпо' }),
      itemAt('lamp', 'primitive:floor_lamp', [-2.2, -1.2], { name: 'Торшер' }),
      againstWall('cabinet', MODELS.drawerCabinet, dims, 'back', -0.9, { name: 'Комод со стеллажом' }),
      itemAt('pendant', MODELS.ceilingLamp, [-1.1, 0], { name: 'Подвесной светильник', elevation: dims.height - 0.952 }),
    ],
  };
};

const bedroom = (): SceneDocument => {
  const dims = { width: 4, height: 2.7, depth: 3.8 };
  const doc = base(dims, 'laminate_floor_02', '#e9e4dc');
  return {
    ...doc,
    finishes: { ...doc.finishes, walls: { ...doc.finishes.walls, back: finish(null, '#b9c2a6') } },
    light: { ...doc.light, temperature: 2700, intensity: 1.1 },
    openings: [windowOn('w1', 'front', 0, 1.6, 1.5, 0.8), doorOn('d1', 'left', 1.0)],
    furniture: [
      againstWall('bed', MODELS.bed, dims, 'back', 0, { name: 'Кровать' }),
      againstWall('nightstand-l', MODELS.sideTable, dims, 'back', -1.072, { name: 'Прикроватная тумба' }),
      againstWall('nightstand-r', MODELS.sideTable, dims, 'back', 1.072, { name: 'Прикроватная тумба' }),
      itemAt('vase', MODELS.vase, [1.072, -1.655], { name: 'Керамическая ваза', elevation: 0.551 }),
      againstWall('dresser', MODELS.drawerCabinet, dims, 'right', 0.6, { name: 'Комод со стеллажом' }),
      itemAt('plant', MODELS.plant, [1.55, 1.55], { name: 'Комнатное растение' }),
      itemAt('armchair', MODELS.armchair, [-1.3, 1.2], { name: 'Кресло', angle: Math.PI }),
    ],
  };
};

const kitchen = (): SceneDocument => {
  const dims = { width: 4.5, height: 2.7, depth: 3.6 };
  const doc = base(dims, 'interior_tiles', '#f1ede6');
  return {
    ...doc,
    finishes: { ...doc.finishes, walls: { ...doc.finishes.walls, back: finish('whitewashed_brick') } },
    openings: [windowOn('w1', 'front', -0.8, 1.4, 1.3, 0.95), doorOn('d1', 'right', 0.9)],
    furniture: [
      againstWall('fridge', 'primitive:fridge', dims, 'back', -1.86, { name: 'Холодильник' }),
      againstWall('counter-1', 'primitive:kitchen_counter', dims, 'back', -0.87, { name: 'Кухонная тумба' }),
      againstWall('counter-2', 'primitive:kitchen_counter', dims, 'back', 0.39, { name: 'Кухонная тумба' }),
      againstWall('washer', 'primitive:washing_machine', dims, 'back', 1.35, { name: 'Стиральная машина' }),
      itemAt('table', MODELS.diningTable, [0.2, 0.55], { name: 'Обеденный стол' }),
      itemAt('chair-1', MODELS.diningChair, [-0.08, 1.24], { name: 'Стул мягкий', angle: Math.PI }),
      itemAt('chair-2', MODELS.diningChair, [0.48, 1.24], { name: 'Стул мягкий', angle: Math.PI }),
      itemAt('chair-3', MODELS.diningChair, [-0.08, -0.14], { name: 'Стул мягкий' }),
      itemAt('chair-4', MODELS.diningChair, [0.48, -0.14], { name: 'Стул мягкий' }),
      itemAt('succulent', MODELS.succulent, [0.2, 0.55], { name: 'Суккулент', elevation: 0.8 }),
    ],
  };
};

const office = (): SceneDocument => {
  const dims = { width: 3.4, height: 2.7, depth: 3.2 };
  return {
    ...base(dims, 'plank_flooring_04', '#e6e1d9'),
    light: { ...DEFAULT_LIGHT, temperature: 4000, intensity: 1.5 },
    openings: [windowOn('w1', 'front', 0, 1.4, 1.4, 0.85), doorOn('d1', 'right', -0.8)],
    furniture: [
      againstWall('desk', 'primitive:desk', dims, 'front', 0, { name: 'Письменный стол' }),
      itemAt('chair', MODELS.woodenChair, [0, 0.56], { name: 'Стул деревянный' }),
      itemAt('lamp', MODELS.deskLamp, [0.5, 1.25], { name: 'Настольная лампа', elevation: 0.75 }),
      itemAt('shelves', MODELS.shelves, [-1.494, 0.2], { name: 'Стеллаж' }),
      againstWall('cabinet', MODELS.drawerCabinet, dims, 'back', 0.6, { name: 'Комод со стеллажом' }),
      itemAt('plant', MODELS.plant, [-1.25, -1.2], { name: 'Комнатное растение' }),
    ],
  };
};

const studioPartition = (height: number): Partition => ({
  id: 'part-bedroom',
  position: [1.2, height / 2, -0.9],
  rotation: [0, Math.PI / 2, 0],
  size: [2.8, height, 0.1],
  openings: [doorOn('pd1', 'part-bedroom', -0.9)],
  finish: finish(null, '#d9cfc2'),
  cornerRadius: 0.05,
});

const studio = (): SceneDocument => {
  const dims = { width: 6.5, height: 2.8, depth: 4.6 };
  return {
    ...base(dims, 'wood_floor', '#ece6dc'),
    openings: [windowOn('w1', 'front', -2.3, 1.2, 1.5, 0.8), windowOn('w2', 'front', 1.0, 1.8, 1.5, 0.8), doorOn('d1', 'back', 0.3)],
    partitions: [studioPartition(dims.height)],
    furniture: [
      itemAt('bed', MODELS.bed, [2.25, -1.26], { name: 'Кровать' }),
      itemAt('plant', MODELS.plantTall, [2.9, 1.8], { name: 'Растение в кашпо' }),
      againstWall('sofa', MODELS.sofa, dims, 'back', -1.2, { name: 'Диван' }),
      itemAt('coffee', MODELS.coffeeTable, [-1.2, -0.9], { name: 'Журнальный столик', angle: Math.PI / 2 }),
      againstWall('tv', MODELS.tvCabinet, dims, 'front', -1.2, { name: 'ТВ-тумба' }),
      againstWall('counter', 'primitive:kitchen_counter', dims, 'left', 0.8, { name: 'Кухонная тумба' }),
      againstWall('fridge', 'primitive:fridge', dims, 'left', -0.6, { name: 'Холодильник' }),
      itemAt('table', MODELS.diningTable, [-1.4, 0.75], { name: 'Обеденный стол' }),
      itemAt('chair-1', MODELS.woodenChair, [-1.7, 1.44], { name: 'Стул деревянный', angle: Math.PI }),
      itemAt('chair-2', MODELS.woodenChair, [-1.1, 1.44], { name: 'Стул деревянный', angle: Math.PI }),
    ],
  };
};

/** Все встроенные шаблоны. */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'living', name: 'Гостиная', description: 'Диван, ТВ-зона, кресло и два больших окна', area: 21, build: living },
  { id: 'bedroom', name: 'Спальня', description: 'Кровать с тумбами, комод и акцентная стена', area: 15.2, build: bedroom },
  { id: 'kitchen', name: 'Кухня-столовая', description: 'Кухонный гарнитур, обеденный стол на четверых', area: 16.2, build: kitchen },
  { id: 'office', name: 'Кабинет', description: 'Рабочее место у окна, стеллаж и хранение', area: 10.9, build: office },
  { id: 'studio', name: 'Студия', description: 'Гостиная, кухня и спальня за перегородкой', area: 29.9, build: studio },
];

/** Найти встроенный шаблон по id. */
export function findBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
