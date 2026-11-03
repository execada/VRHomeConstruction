/**
 * Известные габариты моделей каталога (при scale = 1): для моделей манифеста — реальные
 * размеры после нормализации (их считает конвейер `npm run models:sync`), для процедурных —
 * размеры из кода. Нужны, чтобы размещение и шаблоны были точными ещё до загрузки модели;
 * после загрузки габариты всё равно уточняются измерением.
 * @module furniture/lib/knownSizes
 */

import type { ModelSizes } from './modelLook';
import { MANIFEST_MODEL_SIZES } from './modelProfiles';

const M = '/assets/models';

/** Пути моделей CC0-каталога. */
export const MODELS = {
  sofa: `${M}/Sofa_01/Sofa_01_1k.gltf`,
  armchair: `${M}/modern_arm_chair_01/modern_arm_chair_01_1k.gltf`,
  diningChair: `${M}/dining_chair_02/dining_chair_02_1k.gltf`,
  woodenChair: `${M}/painted_wooden_chair_01/painted_wooden_chair_01_1k.gltf`,
  coffeeTable: `${M}/modern_coffee_table_01/modern_coffee_table_01_1k.gltf`,
  diningTable: `${M}/wooden_table_02/wooden_table_02_1k.gltf`,
  bed: `${M}/GothicBed_01/GothicBed_01_1k.gltf`,
  sideTable: `${M}/side_table_01/side_table_01_1k.gltf`,
  shelves: `${M}/wooden_display_shelves_01/wooden_display_shelves_01_1k.gltf`,
  tvCabinet: `${M}/modern_wooden_cabinet/modern_wooden_cabinet_1k.gltf`,
  drawerCabinet: `${M}/drawer_cabinet/drawer_cabinet_1k.gltf`,
  ceilingLamp: `${M}/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf`,
  deskLamp: `${M}/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf`,
  plantTall: `${M}/potted_plant_01/potted_plant_01_1k.gltf`,
  plant: `${M}/potted_plant_02/potted_plant_02_1k.gltf`,
  succulent: `${M}/potted_plant_04/potted_plant_04_1k.gltf`,
  vase: `${M}/ceramic_vase_02/ceramic_vase_02_1k.gltf`,
  pictureFrame: `${M}/standing_picture_frame_01/standing_picture_frame_01_1k.gltf`,
  officeDesk: `${M}/metal_office_desk/metal_office_desk_1k.gltf`,
  rug: `${M}/rug_wool/rug_wool.gltf`,
  floorLamp: `${M}/floor_lamp_drum/floor_lamp_drum.gltf`,
  fridge: `${M}/fridge_french_door/fridge_french_door.gltf`,
  kitchenSink: `${M}/kitchen_sink_120/kitchen_sink_120.gltf`,
  kitchenHob: `${M}/kitchen_hob_oven_60/kitchen_hob_oven_60.gltf`,
  washingMachine: `${M}/washing_machine/washing_machine.gltf`,
} as const;

/** Габариты процедурных моделей (см. furniture/ui/PrimitiveFurniture). */
const PRIMITIVE_SIZES: Readonly<Record<string, ModelSizes>> = {
  'primitive:sofa': { halfWidth: 0.9, halfDepth: 0.425, height: 0.85 },
  'primitive:stool': { halfWidth: 0.19, halfDepth: 0.19, height: 0.48 },
  'primitive:coffee_table': { halfWidth: 0.5, halfDepth: 0.3, height: 0.45 },
  'primitive:desk': { halfWidth: 0.7, halfDepth: 0.35, height: 0.75 },
  'primitive:shelf': { halfWidth: 0.44, halfDepth: 0.16, height: 1.8 },
  'primitive:kitchen_counter': { halfWidth: 0.62, halfDepth: 0.32, height: 0.93 },
  'primitive:fridge': { halfWidth: 0.35, halfDepth: 0.38, height: 1.8 },
  'primitive:washing_machine': { halfWidth: 0.3, halfDepth: 0.31, height: 0.85 },
  'primitive:tv_stand': { halfWidth: 0.7, halfDepth: 0.21, height: 1.1 },
  'primitive:floor_lamp': { halfWidth: 0.22, halfDepth: 0.22, height: 1.84 },
  'primitive:plant': { halfWidth: 0.39, halfDepth: 0.36, height: 1.31 },
  'primitive:rug': { halfWidth: 1, halfDepth: 0.7, height: 0.022 },
  'primitive:mirror': { halfWidth: 0.35, halfDepth: 0.045, height: 1.7 },
};

/** Габариты по пути модели. */
export const KNOWN_MODEL_SIZES: Readonly<Record<string, ModelSizes>> = { ...MANIFEST_MODEL_SIZES, ...PRIMITIVE_SIZES };
