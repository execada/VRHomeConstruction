/**
 * PBR-материалы процедурных моделей в едином стиле (современный премиальный интерьер):
 * натуральное дерево, бархат, лён, шерсть — CC0-текстуры Poly Haven 1k (общая папка
 * public/assets/models/_textures, скачивает build-procedural.mjs); камень, керамика,
 * металл, стекло — физически правдоподобные параметры без текстур.
 * `tile` — размер одного повтора текстуры в метрах (из габаритов образца на Poly Haven).
 */

/** Текстуры Poly Haven: id → карты (arm — AO/roughness/metalness, как в glTF). */
export const TEXTURES = {
  white_oak_veneer: ['diff', 'nor_gl', 'arm'],
  american_walnut_veneer: ['diff', 'nor_gl', 'arm'],
  velour_velvet: ['nor_gl'],
  rough_linen: ['nor_gl'],
  poly_wool_herringbone: ['diff', 'nor_gl'],
  wool_boucle: ['nor_gl'],
};

const map = (id, kind) => `../_textures/${id}/${kind}.jpg`;
const textured = (id, withArm = false) => ({
  color: map(id, 'diff'),
  normal: map(id, 'nor_gl'),
  ...(withArm ? { arm: map(id, 'arm') } : {}),
});
/** Только рельеф ткани: цвет задаёт фактор (исходные образцы цветные — красный бархат, синий лён). */
const weave = (id) => ({ normal: map(id, 'nor_gl') });

/** Описание материала. */
const material = (name, props) => ({ name, metalness: 0, roughness: 0.5, color: [1, 1, 1, 1], ...props });

export const M = {
  oak: material('oak_veneer', { maps: textured('white_oak_veneer', true), metalness: 1, roughness: 1, tile: 0.5 }),
  // Сырой шпон ореха на образце серый — тонируем в тёплый коричневый, рисунок волокон сохраняется.
  walnut: material('walnut_veneer', { maps: textured('american_walnut_veneer', true), color: [0.66, 0.44, 0.29, 1], metalness: 1, roughness: 1, tile: 1 }),
  velvetTaupe: material('velvet_taupe', { maps: weave('velour_velvet'), color: [0.5, 0.43, 0.37, 1], roughness: 0.8, tile: 0.28 }),
  velvetSage: material('velvet_sage', { maps: weave('velour_velvet'), color: [0.4, 0.46, 0.39, 1], roughness: 0.8, tile: 0.28 }),
  linenWhite: material('linen_white', { maps: weave('rough_linen'), color: [0.96, 0.95, 0.92, 1], roughness: 0.92, tile: 0.27 }),
  linenSand: material('linen_sand', { maps: weave('rough_linen'), color: [0.8, 0.73, 0.62, 1], roughness: 0.92, tile: 0.27 }),
  woolRug: material('wool_herringbone', { maps: textured('poly_wool_herringbone'), color: [1, 0.94, 0.84, 1], roughness: 0.95, tile: 0.27 }),
  boucle: material('wool_boucle', { maps: weave('wool_boucle'), color: [0.93, 0.9, 0.85, 1], roughness: 0.95, tile: 0.35 }),
  quartz: material('quartz_white', { color: [0.9, 0.89, 0.86, 1], roughness: 0.18 }),
  stoneDark: material('stone_graphite', { color: [0.16, 0.16, 0.17, 1], roughness: 0.3 }),
  lacquerGreige: material('lacquer_greige', { color: [0.78, 0.75, 0.7, 1], roughness: 0.38 }),
  lacquerWhite: material('lacquer_white', { color: [0.93, 0.93, 0.91, 1], roughness: 0.32 }),
  ceramic: material('ceramic_glazed', { color: [0.93, 0.93, 0.91, 1], roughness: 0.1 }),
  plasticWhite: material('appliance_white', { color: [0.94, 0.94, 0.93, 1], roughness: 0.28 }),
  steel: material('brushed_steel', { color: [0.78, 0.78, 0.77, 1], metalness: 1, roughness: 0.32 }),
  chrome: material('chrome', { color: [0.96, 0.96, 0.96, 1], metalness: 1, roughness: 0.07 }),
  brass: material('brushed_brass', { color: [0.86, 0.66, 0.38, 1], metalness: 1, roughness: 0.28 }),
  blackMetal: material('black_metal', { color: [0.05, 0.05, 0.05, 1], metalness: 0.7, roughness: 0.42 }),
  blackGlass: material('black_glass', { color: [0.015, 0.015, 0.018, 1], roughness: 0.04 }),
  rubber: material('dark_rubber', { color: [0.08, 0.08, 0.08, 1], roughness: 0.8 }),
  glass: material('clear_glass', { color: [0.86, 0.93, 0.93, 1], roughness: 0.04, opacity: 0.22, doubleSided: true }),
  mirror: material('mirror', { color: [0.95, 0.96, 0.96, 1], metalness: 1, roughness: 0.02 }),
  shadeLinen: material('lamp_shade_linen', { maps: weave('rough_linen'), color: [0.96, 0.93, 0.86, 1], roughness: 0.9, tile: 0.27, emissive: [0.35, 0.3, 0.22], doubleSided: true }),
  screenBlack: material('screen', { color: [0.01, 0.01, 0.012, 1], roughness: 0.06 }),
  display: material('display_glow', { color: [0.05, 0.08, 0.1, 1], roughness: 0.2, emissive: [0.15, 0.55, 0.75] }),
};
