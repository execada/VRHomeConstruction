import { describe, expect, it } from 'vitest';
import { attachType, DEFAULT_MOUNT_HEIGHT, mountHeight } from './attachType';
import { MODELS } from './knownSizes';
import { MODEL_PROFILES } from './modelProfiles';

const M = '/assets/models';
const PICTURE = `${M}/hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf`;
const CLOCK = `${M}/wall_clock/wall_clock_1k.gltf`;
const CHANDELIER = `${M}/Chandelier_01/Chandelier_01_1k.gltf`;
const SHELF = `${M}/wall_shelf_oak/wall_shelf_oak.gltf`;
const AC = `${M}/split_air_conditioner/split_air_conditioner.gltf`;
const SINK = `${M}/wall_sink/wall_sink.gltf`;

describe('тип крепления моделей каталога', () => {
  it('у каждой модели каталога тип крепления задан в манифесте', () => {
    expect([...MODEL_PROFILES.values()].every((p) => p.attach !== undefined)).toBe(true);
  });

  it('картины, часы, полка, кондиционер и подвесная раковина — на стене, люстры — под потолком', () => {
    [PICTURE, CLOCK, SHELF, AC, SINK].forEach((path) => expect(attachType({ modelPath: path }), path).toBe('wall'));
    [CHANDELIER, MODELS.ceilingLamp].forEach((path) => expect(attachType({ modelPath: path }), path).toBe('ceiling'));
  });

  it('мебель — на полу, мелкие предметы — на поверхностях', () => {
    expect(attachType({ modelPath: MODELS.sofa })).toBe('floor');
    expect(attachType({ modelPath: MODELS.diningTable })).toBe('floor');
    expect(attachType({ modelPath: MODELS.vase })).toBe('surface');
    expect(attachType({ modelPath: MODELS.deskLamp })).toBe('surface');
  });

  it('высота подвеса — из манифеста, у остальных — на уровне глаз', () => {
    expect(mountHeight(CLOCK)).toBe(1.9);
    expect(mountHeight(SINK)).toBe(0.69);
    expect(mountHeight(PICTURE)).toBe(1.5);
    expect(mountHeight('/models/poster.glb')).toBe(DEFAULT_MOUNT_HEIGHT);
  });
});

describe('тип крепления своих моделей по названию', () => {
  it.each([
    ['Настенная лампа', 'wall'],
    ['Бра у кровати', 'wall'],
    ['Картина с морем', 'wall'],
    ['Кондиционер в спальню', 'wall'],
    ['Подвесная раковина', 'wall'],
    ['Люстра хрустальная', 'ceiling'],
    ['Подвесной светильник', 'ceiling'],
    ['Потолочный вентилятор', 'ceiling'],
    ['Настольная лампа', 'surface'],
    ['Кресло', 'floor'],
  ] as const)('«%s» — %s', (name, expected) => {
    expect(attachType({ modelPath: '/models/model.glb', name })).toBe(expected);
  });

  it.each([
    ['/models/wall_clock.glb', 'wall'],
    ['/models/sconce-brass.glb', 'wall'],
    ['/models/hanging_frame.glb', 'wall'],
    ['/models/chandelier.glb', 'ceiling'],
    ['/models/pendant_light.glb', 'ceiling'],
    ['/models/office_chair.glb', 'floor'],
  ] as const)('%s — %s', (modelPath, expected) => {
    expect(attachType({ modelPath })).toBe(expected);
  });
});
