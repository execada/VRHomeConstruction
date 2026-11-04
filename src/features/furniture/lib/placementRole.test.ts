import { describe, expect, it } from 'vitest';
import { KNOWN_MODEL_SIZES, MODELS } from './knownSizes';
import { placementRole } from './placementRole';

const role = (name: string, modelPath = '/models/x.glb', sizes = KNOWN_MODEL_SIZES[modelPath]) =>
  placementRole({ name, modelPath, sizes });

describe('placementRole', () => {
  it.each([
    ['Письменный стол', 'primitive:desk'],
    ['Журнальный столик', MODELS.coffeeTable],
    ['Обеденный стол', MODELS.diningTable],
    ['Прикроватная тумба', MODELS.sideTable],
    ['Стеллаж', MODELS.shelves],
    ['ТВ-тумба', MODELS.tvCabinet],
    ['ТВ-тумба с телевизором', 'primitive:tv_stand'],
    ['Комод со стеллажом', MODELS.drawerCabinet],
    ['Кухонная тумба', 'primitive:kitchen_counter'],
    ['Настенная полка', '/models/wall_shelf.glb'],
  ])('treats «%s» as a support', (name, path) => {
    expect(role(name, path)).toBe('support');
  });

  it.each([
    ['Настольная лампа', MODELS.deskLamp],
    ['Керамическая ваза', MODELS.vase],
    ['Фоторамка', MODELS.pictureFrame],
    ['Суккулент', MODELS.succulent],
    ['Стопка книг', '/models/books.glb'],
    ['Телевизор', '/models/tv.glb'],
  ])('treats «%s» as a surface item', (name, path) => {
    expect(role(name, path)).toBe('surface');
  });

  it.each([
    ['Диван', MODELS.sofa],
    ['Кресло', MODELS.armchair],
    ['Стул мягкий', MODELS.diningChair],
    ['Кровать', MODELS.bed],
    ['Торшер', 'primitive:floor_lamp'],
    ['Подвесной светильник', MODELS.ceilingLamp],
    ['Напольная ваза', '/models/vase_big.glb'],
    ['Ковёр', 'primitive:rug'],
    ['Холодильник', 'primitive:fridge'],
    ['Винтажный набор', '/models/retro_vintage_furniture_pack.glb'],
  ])('keeps «%s» on the floor', (name, path) => {
    expect(role(name, path)).toBe('floor');
  });

  it('decides plants by size: small pots go on tables, big ones stay on the floor', () => {
    expect(role('Растение в кашпо', MODELS.plantTall)).toBe('floor');
    expect(role('Комнатное растение', MODELS.plant)).toBe('floor');
    expect(role('Дерево в кадке', 'primitive:plant')).toBe('floor');
    expect(role('Цветок', '/models/flower.glb', { halfWidth: 0.08, halfDepth: 0.08, height: 0.3 })).toBe('surface');
    expect(role('Цветок', '/models/flower.glb', undefined)).toBe('floor');
  });

  it('falls back to the model path when the name says nothing', () => {
    expect(placementRole({ name: 'Предмет', modelPath: '/assets/models/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf' })).toBe('surface');
    expect(placementRole({ name: '', modelPath: '/assets/models/oak_bookcase/oak_bookcase_1k.gltf' })).toBe('support');
    expect(placementRole({ modelPath: '/assets/models/GothicBed_01/GothicBed_01_1k.gltf' })).toBe('floor');
    expect(placementRole({ modelPath: 'primitive:tv_stand' })).toBe('support');
    expect(placementRole({ modelPath: 'primitive:floor_lamp' })).toBe('floor');
  });

  it('uses the head of a phrase: the noun before a preposition, the last noun otherwise', () => {
    expect(role('Стол с лампой')).toBe('support');
    expect(role('Лампа для стола')).toBe('surface');
    expect(placementRole({ modelPath: '/models/lamp_table.glb' })).toBe('support');
    expect(placementRole({ modelPath: '/models/table_lamp.glb' })).toBe('surface');
    expect(placementRole({ modelPath: '/models/chest_of_drawers.glb' })).toBe('support');
  });

  it('keeps oversized «decor» on the floor', () => {
    expect(role('Ваза', '/models/vase.glb', { halfWidth: 1.2, halfDepth: 0.3, height: 0.6 })).toBe('floor');
    expect(role('Лампа', '/models/lamp.glb', { halfWidth: 0.2, halfDepth: 0.2, height: 1.9 })).toBe('floor');
  });
});
