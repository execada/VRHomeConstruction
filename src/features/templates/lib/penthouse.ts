/**
 * Шаблон «Двухуровневый пентхаус»: два этажа над мегаполисом на закате.
 *
 * Нижний уровень 15 × 10 м с потолками 3,2 м — гостиная-кухня-столовая с панорамным
 * остеклением, гостевой санузел, балкон во всю ширину за стеклянной стеной и прямая
 * лестница из гостиной вдоль левой стены. Верхний уровень 15 × 7 м отступает от фасада
 * на 3 м: его крыша над балконом — терраса, на которую выходят стеклянные двери холла
 * и мастер-спальни. Наверху холл со световым проёмом лестницы, коридор, кабинет,
 * мастер-спальня, спальня и ванная — настоящие помещения с дверями.
 * @module templates/lib/penthouse
 */

import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import { DEFAULT_LIGHT, uniformOuterWalls } from '@/features/editor-3d/constants';
import { createEmptyFloor, sceneOf } from '@/features/editor-3d/lib/scene/build';
import type { FloorDocument, SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import type { Opening, Partition, RoomDimensions, Stair } from '@/features/editor-3d/types';
import { MODELS } from '@/features/furniture/lib/knownSizes';
import type { FurnitureItem } from '@/features/furniture/types';
import { againstWall, allWalls, doorOn, finish, itemAt, panoramicWindowOn, windowOn } from './compose';

const M = '/assets/models';

/** Модели премиального интерьера из каталога. */
const P = {
  sofa: `${M}/glam_velvet_sofa/glam_velvet_sofa.gltf`,
  velvetChair: `${M}/sheen_velvet_chair/sheen_velvet_chair.gltf`,
  loungeChair: `${M}/mid_century_lounge_chair/mid_century_lounge_chair_1k.gltf`,
  coffeeTable: `${M}/coffee_table_round_01/coffee_table_round_01_1k.gltf`,
  roundRug: `${M}/rug_round_boucle/rug_round_boucle.gltf`,
  rug: `${M}/rug_wool/rug_wool.gltf`,
  tvCabinet: `${M}/modern_wooden_cabinet/modern_wooden_cabinet_1k.gltf`,
  tv: `${M}/tv_65/tv_65.gltf`,
  floorLamp: `${M}/floor_lamp_drum/floor_lamp_drum.gltf`,
  ceilingLamp: `${M}/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf`,
  chandelier: `${M}/Chandelier_01/Chandelier_01_1k.gltf`,
  plantTall: `${M}/potted_plant_01/potted_plant_01_1k.gltf`,
  plant: `${M}/potted_plant_02/potted_plant_02_1k.gltf`,
  succulent: `${M}/potted_plant_04/potted_plant_04_1k.gltf`,
  brassVase: `${M}/brass_vase_01/brass_vase_01_1k.gltf`,
  vase: `${M}/ceramic_vase_01/ceramic_vase_01_1k.gltf`,
  bust: `${M}/marble_bust_01/marble_bust_01_1k.gltf`,
  diningTable: `${M}/dining_table_walnut/dining_table_walnut.gltf`,
  diningChair: `${M}/dining_chair_02/dining_chair_02_1k.gltf`,
  barStool: `${M}/metal_stool_03/metal_stool_03_1k.gltf`,
  island: `${M}/kitchen_island/kitchen_island.gltf`,
  kitchenBase: `${M}/kitchen_base_120/kitchen_base_120.gltf`,
  kitchenSink: `${M}/kitchen_sink_120/kitchen_sink_120.gltf`,
  hob: `${M}/kitchen_hob_oven_60/kitchen_hob_oven_60.gltf`,
  fridge: `${M}/fridge_french_door/fridge_french_door.gltf`,
  bed: `${M}/bed_upholstered/bed_upholstered.gltf`,
  guestBed: `${M}/GothicBed_01/GothicBed_01_1k.gltf`,
  nightstand: `${M}/nightstand_walnut/nightstand_walnut.gltf`,
  drawerCabinet: `${M}/drawer_cabinet/drawer_cabinet_1k.gltf`,
  mirror: `${M}/floor_mirror_arch/floor_mirror_arch.gltf`,
  sideTable: `${M}/side_table_01/side_table_01_1k.gltf`,
  tub: `${M}/bathtub_freestanding/bathtub_freestanding.gltf`,
  shower: `${M}/shower_walk_in/shower_walk_in.gltf`,
  vanity: `${M}/vanity_walnut/vanity_walnut.gltf`,
  toilet: `${M}/toilet_close_coupled/toilet_close_coupled.gltf`,
} as const;

/** Нижний уровень: 15 × 10 м, потолки 3,2 м. */
const LOWER: RoomDimensions = { width: 15, height: 3.2, depth: 10 };
/** Верхний уровень: 15 × 7 м, потолки 3 м, смещён к задней стене (впереди — терраса). */
const UPPER: RoomDimensions = { width: 15, height: 3, depth: 7 };
const UPPER_OFFSET: [number, number] = [0, -(LOWER.depth - UPPER.depth) / 2];
const HALF_TURN = Math.PI;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const WALLS = '#efe9e1';

/** Предмет на поверхности опоры (стол, тумба, комод). */
const onSupport = (item: FurnitureItem, supportId: string): FurnitureItem => ({ ...item, supportId });

/** Внутренняя стена: центр [x, z], вдоль оси X или Z, длина, толщина, материал и проёмы. */
function wall(
  id: string,
  height: number,
  center: [number, number],
  alongZ: boolean,
  size: [number, number],
  material: Partition['material'],
  openings: Opening[],
): Partition {
  return {
    id,
    position: [center[0], height / 2, center[1]],
    rotation: [0, alongZ ? Math.PI / 2 : 0, 0],
    size: [size[0], height, size[1]],
    openings,
    finish: finish(null, WALLS),
    material,
  };
}

const H1 = LOWER.height;
const H2 = UPPER.height;

// ——— Нижний уровень ———

/** Стеклянная стена балкона и стены гостевого санузла. */
const lowerPartitions = (): Partition[] => [
  wall('w-balcony', H1, [0, 3.4], false, [15, 0.15], 'monolith', [
    panoramicWindowOn('bw-west', 'w-balcony', -5.6, 3.4, 3, 0),
    doorOn('bd-west', 'w-balcony', -3.4, 0.9, 2.4, { style: 'glass' }),
    panoramicWindowOn('bw-living-1', 'w-balcony', -1.1, 2, 3, 0),
    doorOn('bd-living', 'w-balcony', 0.5, 0.9, 2.4, { style: 'glass' }),
    panoramicWindowOn('bw-living-2', 'w-balcony', 4.25, 6, 3, 0),
  ]),
  wall('w-wc-side', H1, [-6.35, -4], true, [2, 0.1], 'drywall', []),
  wall('w-wc-front', H1, [-5.35, -3], false, [2, 0.1], 'drywall', [doorOn('dd-wc', 'w-wc-front', 0.3, 0.8, 2.1, { style: 'flush', swing: 'back' })]),
  wall('w-wc-right', H1, [-4.35, -4], true, [2, 0.1], 'drywall', []),
];

/** Панорамное остекление на город, окно кухни, окна санузла и библиотеки, входная дверь. */
const lowerOpenings = (): Opening[] => [
  panoramicWindowOn('fw-1', 'front', -4.8, 4.4, 3, 0.1),
  panoramicWindowOn('fw-2', 'front', 0, 4.4, 3, 0.1),
  panoramicWindowOn('fw-3', 'front', 4.8, 4.4, 3, 0.1),
  windowOn('rw-kitchen', 'right', -2.6, 2.4, 1.9, 0.9),
  windowOn('bw-wc', 'back', -5.35, 0.6, 0.6, 1.6),
  windowOn('bw-library', 'back', -3.2, 1.4, 1.6, 0.8),
  doorOn('d-entry', 'back', -1.2, 1, 2.3, { style: 'panel' }),
];

/** Прямая лестница из гостиной вдоль левой стены: подъём к задней стене. */
const lowerStairs = (): Stair[] => [{ id: 'stair-main', kind: 'straight', position: [-6.99, -0.8], rotation: 0, width: 1 }];

const living = (): FurnitureItem[] => [
  againstWall('tv-cabinet', P.tvCabinet, LOWER, 'right', 1, { name: 'ТВ-тумба' }),
  onSupport(itemAt('tv', P.tv, [7.3, 1], { name: 'Телевизор 65″', angle: FACE_NEG_X, elevation: 0.68 }), 'tv-cabinet'),
  itemAt('sofa', P.sofa, [3.6, 1], { name: 'Бархатный диван', angle: FACE_POS_X }),
  itemAt('coffee', P.coffeeTable, [5.4, 1], { name: 'Кофейный столик' }),
  onSupport(itemAt('coffee-vase', P.brassVase, [5.4, 1], { name: 'Латунная ваза', elevation: 0.491 }), 'coffee'),
  itemAt('living-rug', P.roundRug, [5.3, 1], { name: 'Круглый ковёр' }),
  itemAt('chair-1', P.velvetChair, [5.4, -0.45], { name: 'Бархатное кресло' }),
  itemAt('chair-2', P.velvetChair, [5.4, 2.45], { name: 'Бархатное кресло', angle: HALF_TURN }),
  itemAt('floor-lamp', P.floorLamp, [3.3, 2.75], { name: 'Торшер' }),
  itemAt('plant-living', P.plantTall, [6.95, 2.85], { name: 'Растение в кашпо' }),
  itemAt('pendant', P.ceilingLamp, [5.4, 1], { name: 'Подвесной светильник', elevation: H1 - 0.952 }),
];

/** Уголок для чтения у лестницы. */
const library = (): FurnitureItem[] => [
  itemAt('lounge-rug', P.roundRug, [-4.3, 0], { name: 'Круглый ковёр' }),
  itemAt('lounge-chair-1', P.loungeChair, [-5.3, 0], { name: 'Лаунж-кресло', angle: FACE_POS_X }),
  itemAt('lounge-chair-2', P.loungeChair, [-3.3, 0], { name: 'Лаунж-кресло', angle: FACE_NEG_X }),
  itemAt('lounge-table', P.sideTable, [-4.3, 0], { name: 'Приставной столик' }),
  onSupport(itemAt('lounge-vase', P.vase, [-4.3, 0], { name: 'Керамическая ваза', elevation: 0.551 }), 'lounge-table'),
  itemAt('lounge-lamp', P.floorLamp, [-5.6, 1.3], { name: 'Торшер' }),
  itemAt('lounge-plant', P.plantTall, [-2.95, -2.5], { name: 'Растение в кашпо' }),
];

const dining = (): FurnitureItem[] => {
  const chairs = [1.25, 2, 2.75].flatMap((x, i) => [
    itemAt(`dining-chair-${i * 2 + 1}`, P.diningChair, [x, -1.062], { name: 'Обеденный стул', angle: HALF_TURN }),
    itemAt(`dining-chair-${i * 2 + 2}`, P.diningChair, [x, -2.738], { name: 'Обеденный стул' }),
  ]);
  return [
    itemAt('dining', P.diningTable, [2, -1.9], { name: 'Обеденный стол из ореха' }),
    onSupport(itemAt('dining-vase', P.brassVase, [2, -1.9], { name: 'Латунная ваза', elevation: 0.76 }), 'dining'),
    itemAt('chandelier', P.chandelier, [2, -1.9], { name: 'Люстра', elevation: H1 - 0.798 }),
    ...chairs,
  ];
};

const kitchen = (): FurnitureItem[] => [
  againstWall('fridge', P.fridge, LOWER, 'back', 6.95, { name: 'Холодильник' }),
  againstWall('kitchen-base', P.kitchenBase, LOWER, 'back', 5.85, { name: 'Кухонный модуль' }),
  againstWall('hob', P.hob, LOWER, 'back', 4.9, { name: 'Варочная панель с духовкой' }),
  againstWall('kitchen-sink', P.kitchenSink, LOWER, 'back', 3.95, { name: 'Кухонный модуль с мойкой' }),
  itemAt('island', P.island, [5.4, -2.8], { name: 'Кухонный остров' }),
  onSupport(itemAt('island-vase', P.vase, [4.6, -2.8], { name: 'Керамическая ваза', elevation: 0.92 }), 'island'),
  ...[4.6, 5.4, 6.2].map((x, i) => itemAt(`stool-${i + 1}`, P.barStool, [x, -2.006], { name: 'Барный стул', angle: HALF_TURN })),
];

const guestWc = (): FurnitureItem[] => [
  againstWall('wc-toilet', P.toilet, LOWER, 'back', -5.8, { name: 'Унитаз' }),
  itemAt('wc-vanity', P.vanity, [-4.683, -4.45], { name: 'Тумба с раковиной', angle: FACE_NEG_X }),
];

const balcony = (): FurnitureItem[] => [
  itemAt('balcony-lounge-1', P.loungeChair, [1.8, 4.2], { name: 'Лаунж-кресло' }),
  itemAt('balcony-lounge-2', P.loungeChair, [3.6, 4.2], { name: 'Лаунж-кресло' }),
  itemAt('balcony-table', P.sideTable, [2.7, 4.2], { name: 'Приставной столик' }),
  itemAt('balcony-plant-1', P.plant, [6.6, 4.2], { name: 'Растение в кашпо' }),
  itemAt('balcony-plant-2', P.plant, [-6.6, 4.2], { name: 'Растение в кашпо' }),
];

const lowerFloor = (): FloorDocument => ({
  ...createEmptyFloor(LOWER, { id: 'floor-1', name: 'Нижний уровень' }),
  outerWalls: uniformOuterWalls(0.3, 'monolith'),
  finishes: { floor: finish('marble_01'), ceiling: finish(null, '#fbfaf7'), walls: allWalls(finish(null, WALLS)) },
  light: { ...DEFAULT_LIGHT, temperature: 3200, intensity: 1.6 },
  openings: lowerOpenings(),
  partitions: lowerPartitions(),
  rooms: [
    { id: 'room-living', name: 'Гостиная, кухня и столовая', anchor: [2.5, -0.5] },
    { id: 'room-wc', name: 'Гостевой санузел', anchor: [-5.35, -4] },
    { id: 'room-balcony', name: 'Панорамный балкон', anchor: [0, 4.25], kind: 'balcony' },
  ],
  stairs: lowerStairs(),
  furniture: [...living(), ...library(), ...dining(), ...kitchen(), ...guestWc(), ...balcony()],
});

// ——— Верхний уровень (координаты этажа; центр смещён на UPPER_OFFSET) ———

/** Стена холла с проходом в коридор, стены коридора, кабинета и ванной. */
const upperPartitions = (): Partition[] => [
  wall('u-hall', H2, [-4.4, 0], true, [7, 0.12], 'aerated', [doorOn('uw-corridor', 'u-hall', 0, 0.9, 2.2, null)]),
  wall('u-front', H2, [1.55, 0.6], false, [11.9, 0.12], 'aerated', [
    doorOn('ud-study', 'u-front', -3.95, 0.9, 2.1, { style: 'panel' }),
    doorOn('ud-master', 'u-front', 0.65, 0.9, 2.1, { style: 'panel' }),
  ]),
  wall('u-back', H2, [1.55, -0.6], false, [11.9, 0.12], 'aerated', [
    doorOn('ud-bedroom', 'u-back', -3.95, 0.9, 2.1, { style: 'panel', swing: 'back' }),
    doorOn('ud-bath', 'u-back', 2.45, 0.8, 2.1, { style: 'flush', swing: 'back' }),
  ]),
  wall('u-study', H2, [1, 2.05], true, [2.9, 0.12], 'drywall', []),
  wall('u-bath', H2, [2.5, -2.05], true, [2.9, 0.12], 'drywall', []),
];

/** Выходы на террасу, панорамные окна кабинета и спальни, окна на задний фасад. */
const upperOpenings = (): Opening[] => [
  doorOn('ut-hall', 'front', 5.4, 1, 2.4, { style: 'glass' }),
  panoramicWindowOn('uw-study', 'front', 1.7, 3.6, H2, 0.1),
  panoramicWindowOn('uw-master', 'front', -2.6, 2.4, H2, 0.1),
  doorOn('ut-master', 'front', -4.5, 1, 2.4, { style: 'glass' }),
  windowOn('uw-hall', 'back', -5.9, 1.2, 1.5, 0.9),
  windowOn('uw-bedroom', 'back', -3.2, 1.4, 1.5, 0.8),
  windowOn('uw-bath', 'back', 5, 1.2, 1, 1.4),
];

const hall = (): FurnitureItem[] => [
  itemAt('hall-plant', P.plantTall, [-5, -3], { name: 'Растение в кашпо' }),
  itemAt('hall-mirror', P.mirror, [-4.58, -1.8], { name: 'Арочное зеркало', angle: FACE_NEG_X }),
];

const study = (): FurnitureItem[] => [
  againstWall('study-desk', MODELS.officeDesk, UPPER, 'front', -1.7, { name: 'Письменный стол' }),
  itemAt('study-chair', MODELS.woodenChair, [-1.7, 2.15], { name: 'Стул деревянный' }),
  onSupport(itemAt('study-lamp', MODELS.deskLamp, [-1, 3.05], { name: 'Настольная лампа', elevation: 0.788 }), 'study-desk'),
  itemAt('study-shelves', MODELS.shelves, [-4.144, 2], { name: 'Стеллаж' }),
  itemAt('study-plant', P.plant, [0.45, 1.15], { name: 'Растение в кашпо' }),
];

const masterSuite = (): FurnitureItem[] => [
  againstWall('bed-master', P.bed, UPPER, 'right', 2.38, { name: 'Кровать с мягким изголовьем' }),
  againstWall('ns-master', P.nightstand, UPPER, 'right', 1.075, { name: 'Прикроватная тумба' }),
  onSupport(itemAt('succulent-master', P.succulent, [7.25, 1.075], { name: 'Суккулент', elevation: 0.52 }), 'ns-master'),
  itemAt('master-rug', P.rug, [5.2, 2.2], { name: 'Ковёр шерстяной' }),
  itemAt('lounge-master', P.loungeChair, [3, 2.7], { name: 'Лаунж-кресло' }),
  itemAt('master-mirror', P.mirror, [4, 0.78], { name: 'Арочное зеркало' }),
];

const bedroom = (): FurnitureItem[] => [
  againstWall('bed-guest', P.guestBed, UPPER, 'back', -0.9, { name: 'Кровать' }),
  againstWall('ns-guest', P.nightstand, UPPER, 'back', 0.25, { name: 'Прикроватная тумба' }),
  itemAt('cabinet-guest', P.drawerCabinet, [2.186, -2], { name: 'Комод', angle: FACE_NEG_X }),
  onSupport(itemAt('bust', P.bust, [2.186, -2], { name: 'Мраморный бюст', elevation: 1.881 }), 'cabinet-guest'),
  itemAt('guest-plant', P.plant, [-3.8, -1.3], { name: 'Растение в кашпо' }),
];

const bathroom = (): FurnitureItem[] => [
  againstWall('tub', P.tub, UPPER, 'back', 6.3, { name: 'Отдельно стоящая ванна', gap: 0.1 }),
  againstWall('shower', P.shower, UPPER, 'right', -1.4, { name: 'Душевая' }),
  itemAt('vanity', P.vanity, [2.843, -2.4], { name: 'Тумба с раковиной', angle: FACE_POS_X }),
  againstWall('toilet', P.toilet, UPPER, 'back', 3.6, { name: 'Унитаз' }),
];

const upperFloor = (): FloorDocument => ({
  ...createEmptyFloor(UPPER, { id: 'floor-2', name: 'Верхний уровень', offset: UPPER_OFFSET }),
  outerWalls: uniformOuterWalls(0.3, 'monolith'),
  finishes: { floor: finish('herringbone_parquet'), ceiling: finish(null, '#fbfaf7'), walls: allWalls(finish(null, WALLS)) },
  light: { ...DEFAULT_LIGHT, temperature: 3000, intensity: 1.4 },
  openings: upperOpenings(),
  partitions: upperPartitions(),
  rooms: [
    { id: 'up-hall', name: 'Холл', anchor: [-5.5, -2.8] },
    { id: 'up-corridor', name: 'Коридор', anchor: [1.5, 0] },
    { id: 'up-study', name: 'Кабинет', anchor: [-2, 2] },
    { id: 'up-master', name: 'Мастер-спальня', anchor: [3.5, 2] },
    { id: 'up-bedroom', name: 'Спальня', anchor: [-1.5, -2] },
    { id: 'up-bath', name: 'Ванная', anchor: [4.5, -2] },
  ],
  furniture: [...hall(), ...study(), ...masterSuite(), ...bedroom(), ...bathroom()],
});

/** Документ сцены пентхауса. */
export const penthouse = (): SceneDocument =>
  sceneOf([lowerFloor(), upperFloor()], {
    sun: { ...DEFAULT_ENVIRONMENT.sun, side: 'front', timeOfDay: 18.2, intensity: 2.2 },
    sky: { ...DEFAULT_ENVIRONMENT.sky, mode: 'hdri', hdriId: 'sunset_jhbcentral' },
  });
