import { describe, expect, it } from 'vitest';
import { stepPlayer, stepVertical, type VerticalState } from '@/features/camera/lib/firstPerson';
import { add2, scale2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { analyzeWalls } from '../wallJoints';
import { createEmptyFloor, toEditorPayload } from '../scene/build';
import { stairLayout } from '../stairs/stairs';
import type { FloorContent, Stair } from '../../types';
import { buildingLot, floorFrames, floorIndexAt } from './floors';
import { buildWalkWorld, groundAt, MAX_STEP, obstaclesAt, type WalkWorld } from './walk';

const SLAB = 0.3;
const HEIGHT = 3;
const stair: Stair = { id: 's', kind: 'straight', position: [-3, 0], rotation: 0, width: 1 };
const layout = stairLayout('straight', HEIGHT + SLAB, 1);

const content = (patch: Partial<FloorContent> = {}): FloorContent => ({
  ...toEditorPayload(createEmptyFloor({ width: 10, height: HEIGHT, depth: 8 })),
  furniture: [],
  ...patch,
});

/** Двухэтажный дом 10 × 8 м с лестницей на первом этаже вдоль оси Z. */
function house(): { world: WalkWorld; frames: ReturnType<typeof floorFrames> } {
  const frames = floorFrames(
    [
      { id: 'a', offset: [0, 0], height: HEIGHT },
      { id: 'b', offset: [0, 0], height: HEIGHT },
    ],
    SLAB,
  );
  const floors = [
    { frame: frames[0], content: content({ stairs: [stair] }) },
    { frame: frames[1], content: content() },
  ].map((f) => ({ ...f, layout: analyzeWalls(f.content.dimensions, f.content.partitions) }));
  return { world: buildWalkWorld(floors, SLAB, buildingLot(floors)), frames };
}

const PHYSICS = { jump: 0, gravity: 14, maxStep: MAX_STEP };

/** Пройти от точки по направлению, обновляя высоту ступней как в камере от первого лица. */
function walk(world: WalkWorld, from: Vec2, dir: Vec2, distance: number, feet0 = 0): { at: Vec2; feet: number; maxFeet: number } {
  let at = from;
  let state: VerticalState = { feet: feet0, velocity: 0, grounded: true };
  let maxFeet = feet0;
  const dt = 1 / 60;
  const step = 2.2 * dt;
  for (let d = 0; d < distance; d += step) {
    at = stepPlayer(at, scale2(dir, step), world.bounds, obstaclesAt(world, state.feet, 1.6));
    state = stepVertical(state, groundAt(world, at, state.feet), dt, PHYSICS);
    maxFeet = Math.max(maxFeet, state.feet);
  }
  return { at, feet: state.feet, maxFeet };
}

describe('хождение по этажам', () => {
  const { world, frames } = house();
  const bottom: Vec2 = [stair.position[0], stair.position[1] + layout.length / 2];

  it('на полу опора — пол этажа, на марше — ступень под ногами', () => {
    expect(groundAt(world, [2, 2], 0)).toBe(0);
    expect(groundAt(world, add2(bottom, [0, -0.05]), 0)).toBeCloseTo(layout.riser);
    // Ступень выше MAX_STEP не «подхватывает» — опора остаётся полом
    expect(groundAt(world, [stair.position[0], 0], 0)).toBe(0);
    // Наверху — пол второго этажа
    expect(groundAt(world, [2, 2], frames[1].base)).toBeCloseTo(frames[1].base);
  });

  it('по ступеням поднимаются на второй этаж: высота глаз следует ступеням', () => {
    const up = walk(world, add2(bottom, [0, 0.4]), [0, -1], layout.length + 1.2);
    expect(up.feet).toBeCloseTo(frames[1].base, 1);
    expect(floorIndexAt(frames, up.feet)).toBe(1);
  });

  it('и спускаются обратно на первый', () => {
    const top: Vec2 = [stair.position[0], stair.position[1] - layout.length / 2 - 0.4];
    const down = walk(world, top, [0, 1], layout.length + 1.2, frames[1].base);
    expect(down.feet).toBeCloseTo(0, 1);
    expect(floorIndexAt(frames, down.feet)).toBe(0);
  });

  it('с пола нельзя зайти на марш сбоку или из-под верхнего края', () => {
    const side = walk(world, [stair.position[0] + 1.5, 0], [-1, 0], 2);
    expect(side.at[0]).toBeGreaterThan(stair.position[0] + stair.width / 2 - 0.01);
    expect(side.maxFeet).toBe(0);
    const behind = walk(world, [stair.position[0], -layout.length / 2 - 0.8], [0, 1], 2);
    expect(behind.at[1]).toBeLessThan(-layout.length / 2);
    expect(behind.maxFeet).toBe(0);
  });

  it('наверху ограждение не даёт шагнуть в проём лестницы', () => {
    const fall = walk(world, [stair.position[0] + 1.5, 0], [-1, 0], 2, frames[1].base);
    expect(fall.feet).toBeCloseTo(frames[1].base);
    expect(fall.at[0]).toBeGreaterThan(stair.position[0] + stair.width / 2 - 0.01);
  });

  it('мебель мешает только на своём этаже, ковёр не мешает вовсе', () => {
    const floorsWithFurniture = floorFrames(
      [
        { id: 'a', offset: [0, 0], height: HEIGHT },
        { id: 'b', offset: [0, 0], height: HEIGHT },
      ],
      SLAB,
    );
    const cabinet = { id: 'c', name: 'Шкаф', modelPath: 'primitive:shelf', position: [2, 0, 2] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1, halfWidth: 0.5, halfDepth: 0.3, height: 1.8 };
    const rug = { ...cabinet, id: 'r', modelPath: 'primitive:rug', position: [-2, 0, 2] as [number, number, number], height: 0.02 };
    const built = [
      { frame: floorsWithFurniture[0], content: content({ furniture: [rug] }) },
      { frame: floorsWithFurniture[1], content: content({ furniture: [cabinet] }) },
    ].map((f) => ({ ...f, layout: analyzeWalls(f.content.dimensions, f.content.partitions) }));
    const w = buildWalkWorld(built, SLAB, buildingLot(built));
    const upstairs = walk(w, [0.5, 2], [1, 0], 2, floorsWithFurniture[1].base);
    expect(upstairs.at[0]).toBeLessThan(2 - 0.5);
    const downstairs = walk(w, [0.5, 2], [1, 0], 2, 0);
    expect(downstairs.at[0]).toBeGreaterThan(2);
    const overRug = walk(w, [-3, 2], [1, 0], 2, 0);
    expect(overRug.at[0]).toBeGreaterThan(-1.5);
  });

  it('препятствия этажа мешают только на его высоте', () => {
    expect(obstaclesAt(world, 0, 1.6).length).toBeLessThan(world.obstacles.length);
    expect(obstaclesAt(world, frames[1].base, 1.6).length).toBeGreaterThan(0);
  });
});

describe('вертикальный шаг', () => {
  const grounded: VerticalState = { feet: 0, velocity: 0, grounded: true };

  it('на ступеньку вверх и вниз — без падения', () => {
    expect(stepVertical(grounded, 0.17, 0.016, PHYSICS)).toEqual({ feet: 0.17, velocity: 0, grounded: true });
    expect(stepVertical({ ...grounded, feet: 0.34 }, 0.17, 0.016, PHYSICS).feet).toBeCloseTo(0.17);
  });

  it('прыжок даёт скорость вверх, затем падение до опоры', () => {
    let s = stepVertical(grounded, 0, 0.016, { ...PHYSICS, jump: 4 });
    expect(s.grounded).toBe(false);
    for (let i = 0; i < 120 && !s.grounded; i += 1) s = stepVertical(s, 0, 0.016, PHYSICS);
    expect(s).toEqual({ feet: 0, velocity: 0, grounded: true });
  });

  it('с края — падение с ускорением до опоры ниже', () => {
    let s: VerticalState = { feet: 3.3, velocity: 0, grounded: true };
    s = stepVertical(s, 0, 0.016, PHYSICS);
    expect(s.grounded).toBe(false);
    expect(s.feet).toBeLessThan(3.3);
    for (let i = 0; i < 200 && !s.grounded; i += 1) s = stepVertical(s, 0, 0.016, PHYSICS);
    expect(s.feet).toBe(0);
  });

  it('без опоры остаётся на месте', () => {
    expect(stepVertical({ feet: 1, velocity: -2, grounded: false }, null, 0.016, PHYSICS)).toEqual({ feet: 1, velocity: 0, grounded: true });
  });
});
