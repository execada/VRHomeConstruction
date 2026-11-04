/**
 * Шаблон «Апартаменты 150 м²»: пентхаус 15 × 10 м с потолками 3,2 м, панорамным
 * остеклением и балконом на всю ширину за стеклянной стеной; за окнами — мегаполис
 * на закате. Гостиная-кухня-столовая, мастер-спальня с ванной и гостевая спальня —
 * настоящие помещения, ограниченные внутренними стенами с дверями.
 * @module templates/lib/penthouse
 */

import { DEFAULT_ENVIRONMENT } from '@/features/environment/constants';
import { DEFAULT_LIGHT, uniformOuterWalls } from '@/features/editor-3d/constants';
import { createEmptyScene } from '@/features/editor-3d/lib/scene/build';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import type { Opening, Partition } from '@/features/editor-3d/types';
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

const DIMS = { width: 15, height: 3.2, depth: 10 };
const H = DIMS.height;
const HALF_TURN = Math.PI;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;

/** Предмет на поверхности опоры (стол, тумба, комод). */
const onSupport = (item: FurnitureItem, supportId: string): FurnitureItem => ({ ...item, supportId });

/** Внутренняя стена: центр [x, z], вдоль оси X или Z, длина, толщина, материал и проёмы. */
function wall(id: string, center: [number, number], alongZ: boolean, length: number, thickness: number, material: Partition['material'], openings: Opening[]): Partition {
  return {
    id,
    position: [center[0], H / 2, center[1]],
    rotation: [0, alongZ ? Math.PI / 2 : 0, 0],
    size: [length, H, thickness],
    openings,
    finish: finish(null, '#efe9e1'),
    material,
  };
}

/** Стеклянная стена балкона, стена спального крыла, стена мастер-сюиты и стена ванной. */
const partitions = (): Partition[] => [
  wall('w-balcony', [0, 3.4], false, 15, 0.15, 'monolith', [
    panoramicWindowOn('bw-bed', 'w-balcony', -5.6, 3.4, 3, 0),
    doorOn('bd-bed', 'w-balcony', -3.4, 0.9, 2.4, { style: 'glass' }),
    panoramicWindowOn('bw-living-1', 'w-balcony', -1.1, 2, 3, 0),
    doorOn('bd-living', 'w-balcony', 0.5, 0.9, 2.4, { style: 'glass' }),
    panoramicWindowOn('bw-living-2', 'w-balcony', 4.25, 6, 3, 0),
  ]),
  wall('w-wing', [-2.5, -0.8], true, 8.4, 0.12, 'aerated', [
    doorOn('dd-master', 'w-wing', -0.8, 0.9, 2.2, { style: 'panel' }),
    doorOn('dd-guest', 'w-wing', 1.1, 0.9, 2.2, { style: 'panel' }),
  ]),
  wall('w-suite', [-5, -0.6], false, 5, 0.12, 'drywall', [doorOn('dd-bath', 'w-suite', -1.3, 0.8, 2.1, { style: 'flush', swing: 'back' })]),
  wall('w-bath', [-5.3, -2.8], true, 4.4, 0.1, 'drywall', []),
];

/** Панорамное остекление на город, окно кухни, окна ванной и гостевой, входная дверь. */
const openings = (): Opening[] => [
  panoramicWindowOn('fw-1', 'front', -4.8, 4.4, 3, 0.1),
  panoramicWindowOn('fw-2', 'front', 0, 4.4, 3, 0.1),
  panoramicWindowOn('fw-3', 'front', 4.8, 4.4, 3, 0.1),
  windowOn('rw-kitchen', 'right', -2.6, 2.4, 1.9, 0.9),
  windowOn('bw-bath', 'back', -6.4, 1, 1, 1.4),
  windowOn('bw-guest', 'back', -3.9, 1.6, 1.6, 0.8),
  doorOn('d-entry', 'back', -1.2, 1, 2.3, { style: 'panel' }),
];

const living = (): FurnitureItem[] => [
  againstWall('tv-cabinet', P.tvCabinet, DIMS, 'right', 1, { name: 'ТВ-тумба' }),
  onSupport(itemAt('tv', P.tv, [7.3, 1], { name: 'Телевизор 65″', angle: FACE_NEG_X, elevation: 0.68 }), 'tv-cabinet'),
  itemAt('sofa', P.sofa, [3.6, 1], { name: 'Бархатный диван', angle: FACE_POS_X }),
  itemAt('coffee', P.coffeeTable, [5.4, 1], { name: 'Кофейный столик' }),
  onSupport(itemAt('coffee-vase', P.brassVase, [5.4, 1], { name: 'Латунная ваза', elevation: 0.491 }), 'coffee'),
  itemAt('living-rug', P.roundRug, [5.3, 1], { name: 'Круглый ковёр' }),
  itemAt('chair-1', P.velvetChair, [5.4, -0.45], { name: 'Бархатное кресло' }),
  itemAt('chair-2', P.velvetChair, [5.4, 2.45], { name: 'Бархатное кресло', angle: HALF_TURN }),
  itemAt('floor-lamp', P.floorLamp, [3.3, 2.75], { name: 'Торшер' }),
  itemAt('plant-living', P.plantTall, [6.95, 2.85], { name: 'Растение в кашпо' }),
  itemAt('pendant', P.ceilingLamp, [5.4, 1], { name: 'Подвесной светильник', elevation: H - 0.952 }),
];

const dining = (): FurnitureItem[] => {
  const chairs = [1.25, 2, 2.75].flatMap((x, i) => [
    itemAt(`dining-chair-${i * 2 + 1}`, P.diningChair, [x, -1.062], { name: 'Обеденный стул', angle: HALF_TURN }),
    itemAt(`dining-chair-${i * 2 + 2}`, P.diningChair, [x, -2.738], { name: 'Обеденный стул' }),
  ]);
  return [
    itemAt('dining', P.diningTable, [2, -1.9], { name: 'Обеденный стол из ореха' }),
    onSupport(itemAt('dining-vase', P.brassVase, [2, -1.9], { name: 'Латунная ваза', elevation: 0.76 }), 'dining'),
    itemAt('chandelier', P.chandelier, [2, -1.9], { name: 'Люстра', elevation: H - 0.798 }),
    ...chairs,
  ];
};

const kitchen = (): FurnitureItem[] => [
  againstWall('fridge', P.fridge, DIMS, 'back', 6.95, { name: 'Холодильник' }),
  againstWall('kitchen-base', P.kitchenBase, DIMS, 'back', 5.85, { name: 'Кухонный модуль' }),
  againstWall('hob', P.hob, DIMS, 'back', 4.9, { name: 'Варочная панель с духовкой' }),
  againstWall('kitchen-sink', P.kitchenSink, DIMS, 'back', 3.95, { name: 'Кухонный модуль с мойкой' }),
  itemAt('island', P.island, [5.4, -2.8], { name: 'Кухонный остров' }),
  onSupport(itemAt('island-vase', P.vase, [4.6, -2.8], { name: 'Керамическая ваза', elevation: 0.92 }), 'island'),
  ...[4.6, 5.4, 6.2].map((x, i) => itemAt(`stool-${i + 1}`, P.barStool, [x, -2.006], { name: 'Барный стул', angle: HALF_TURN })),
];

const masterSuite = (): FurnitureItem[] => [
  againstWall('bed-master', P.bed, DIMS, 'left', 1.4, { name: 'Кровать с мягким изголовьем' }),
  againstWall('ns-1', P.nightstand, DIMS, 'left', 2.705, { name: 'Прикроватная тумба' }),
  againstWall('ns-2', P.nightstand, DIMS, 'left', 0.095, { name: 'Прикроватная тумба' }),
  onSupport(itemAt('succulent-1', P.succulent, [-7.25, 2.705], { name: 'Суккулент', elevation: 0.52 }), 'ns-1'),
  onSupport(itemAt('succulent-2', P.succulent, [-7.25, 0.095], { name: 'Суккулент', elevation: 0.52 }), 'ns-2'),
  itemAt('master-rug', P.rug, [-5.4, 1.4], { name: 'Ковёр шерстяной' }),
  itemAt('lounge-master', P.loungeChair, [-4.6, 2.55], { name: 'Лаунж-кресло', angle: HALF_TURN }),
  itemAt('mirror', P.mirror, [-4.2, -0.4], { name: 'Арочное зеркало' }),
  againstWall('tub', P.tub, DIMS, 'back', -6.4, { name: 'Отдельно стоящая ванна', gap: 0.1 }),
  againstWall('shower', P.shower, DIMS, 'left', -2.4, { name: 'Душевая' }),
  itemAt('vanity', P.vanity, [-5.64, -2.2], { name: 'Тумба с раковиной', angle: FACE_NEG_X }),
  itemAt('toilet', P.toilet, [-5.687, -3.6], { name: 'Унитаз', angle: FACE_NEG_X }),
];

const guestRoom = (): FurnitureItem[] => [
  itemAt('bed-guest', P.guestBed, [-4.21, -3.2], { name: 'Кровать', angle: FACE_POS_X }),
  itemAt('ns-guest', P.nightstand, [-5.005, -4.3], { name: 'Прикроватная тумба', angle: FACE_POS_X }),
  itemAt('cabinet-guest', P.drawerCabinet, [-4.3, -0.92], { name: 'Комод', angle: HALF_TURN }),
  onSupport(itemAt('bust', P.bust, [-4.3, -0.92], { name: 'Мраморный бюст', elevation: 1.881 }), 'cabinet-guest'),
];

const balcony = (): FurnitureItem[] => [
  itemAt('balcony-lounge-1', P.loungeChair, [1.8, 4.2], { name: 'Лаунж-кресло' }),
  itemAt('balcony-lounge-2', P.loungeChair, [3.6, 4.2], { name: 'Лаунж-кресло' }),
  itemAt('balcony-table', P.sideTable, [2.7, 4.2], { name: 'Приставной столик' }),
  itemAt('balcony-plant-1', P.plant, [6.6, 4.2], { name: 'Растение в кашпо' }),
  itemAt('balcony-plant-2', P.plant, [-6.6, 4.2], { name: 'Растение в кашпо' }),
];

/** Документ сцены апартаментов. */
export const penthouse = (): SceneDocument => ({
  ...createEmptyScene(DIMS),
  outerWalls: uniformOuterWalls(0.3, 'monolith'),
  finishes: {
    floor: finish('marble_01'),
    ceiling: finish(null, '#fbfaf7'),
    walls: allWalls(finish(null, '#efe9e1')),
  },
  light: { ...DEFAULT_LIGHT, temperature: 3200, intensity: 1.6 },
  environment: {
    sun: { ...DEFAULT_ENVIRONMENT.sun, side: 'front', timeOfDay: 18.2, intensity: 2.2 },
    sky: { ...DEFAULT_ENVIRONMENT.sky, mode: 'hdri', hdriId: 'sunset_jhbcentral' },
  },
  openings: openings(),
  partitions: partitions(),
  rooms: [
    { id: 'room-living', name: 'Гостиная, кухня и столовая', anchor: [2.5, -0.5] },
    { id: 'room-master', name: 'Мастер-спальня', anchor: [-4, 1.4] },
    { id: 'room-bath', name: 'Ванная', anchor: [-6.4, -2.8] },
    { id: 'room-guest', name: 'Гостевая спальня', anchor: [-3.9, -2] },
    { id: 'room-balcony', name: 'Панорамный балкон', anchor: [0, 4.25], kind: 'balcony' },
  ],
  furniture: [...living(), ...dining(), ...kitchen(), ...masterSuite(), ...guestRoom(), ...balcony()],
});
