/**
 * Селекторы здания: этажи с содержимым и положением, активный этаж, этаж под ним,
 * габариты и участок, вырезы под лестницы, мир для хождения.
 * Содержимое активного этажа берётся из слайсов редактора и мебели («живое»),
 * остальных — из слайса здания; ссылки на неизменённые данные стабильны.
 * @module editor-3d/building/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import type { Rect } from '@/shared/lib/math/geometry2d';
import { DEFAULT_ROOM_HEIGHT } from '../constants';
import { cachedWallLayout } from '../lib/layoutCache';
import { buildingBounds, buildingLot, floorFrames, floorRise, roofLevel, type FloorFrame } from '../lib/building/floors';
import { intersectRects, translateRect } from '../lib/building/rects';
import { stairCutouts } from '../lib/building/slabs';
import { createWalkBuilder } from '../lib/building/walk';
import { liveFloorContent } from '../lib/scene/build';
import { interiorRect } from '../lib/walls';
import { selectors as editorSelectors } from '../selectors';
import type { BuildingState, FloorContent, FloorMeta } from '../types';
import { name } from './slice';

type State = { [name]: BuildingState };

/** Этаж здания целиком. */
export interface BuildingFloor {
  meta: FloorMeta;
  content: FloorContent;
  frame: FloorFrame;
}

const root = (state: State) => state[name];

const selectFloorMetas = createSelector(root, (b) => b.floors);
const selectActiveFloorId = createSelector(root, (b) => b.activeId);
const selectStash = createSelector(root, (b) => b.stash);
const selectSlabThickness = createSelector(root, (b) => b.slabThickness);

/** Содержимое активного этажа (из слайсов редактора и мебели). */
const selectActiveFloorContent = createSelector(
  [
    editorSelectors.selectDimensions,
    editorSelectors.selectFinishes,
    editorSelectors.selectOuterWalls,
    editorSelectors.selectRemovedWalls,
    editorSelectors.selectLightConfig,
    editorSelectors.selectOpenings,
    editorSelectors.selectPartitions,
    editorSelectors.selectRoomLabels,
    editorSelectors.selectStairs,
    furnitureSelectors.selectFurnitureItems,
  ],
  (dimensions, finishes, outerWalls, removedWalls, light, openings, partitions, rooms, stairs, furniture) =>
    liveFloorContent({ dimensions, finishes, outerWalls, removedWalls, light, openings, partitions, rooms, stairs }, furniture),
);

/** Высоты этажей одной строкой — значение не меняется, пока не изменилась высота какого-то этажа. */
const selectFloorHeights = createSelector(
  [selectFloorMetas, selectStash, selectActiveFloorId, editorSelectors.selectDimensions],
  (metas, stash, activeId, dims) =>
    metas.map((m) => (m.id === activeId ? dims.height : stash[m.id]?.dimensions.height ?? DEFAULT_ROOM_HEIGHT)).join('|'),
);

const framesEqual = (a: readonly FloorFrame[], b: readonly FloorFrame[]) =>
  a.length === b.length &&
  a.every((f, i) => {
    const o = b[i];
    return f.id === o.id && f.base === o.base && f.height === o.height && f.offset[0] === o.offset[0] && f.offset[1] === o.offset[1];
  });

const rectEqual = (a: Rect, b: Rect) => a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;

/** Положение этажей в здании (снизу вверх); та же ссылка, пока положение не изменилось (переименование его не меняет). */
const selectFloorFrames = createSelector(
  [selectFloorMetas, selectFloorHeights, selectSlabThickness],
  (metas, heights, slab) => {
    const list = heights.split('|').map(Number);
    return floorFrames(metas.map((m, i) => ({ id: m.id, offset: m.offset, height: list[i] ?? DEFAULT_ROOM_HEIGHT })), slab);
  },
  { memoizeOptions: { resultEqualityCheck: framesEqual } },
);

/** Все этажи с содержимым и положением. */
const selectFloors = createSelector(
  [selectFloorMetas, selectStash, selectActiveFloorId, selectActiveFloorContent, selectFloorFrames],
  (metas, stash, activeId, live, frames): BuildingFloor[] =>
    metas.map((meta, i) => ({ meta, content: meta.id === activeId ? live : stash[meta.id] ?? live, frame: frames[i] })),
);

/** Номер активного этажа снизу (с 0). */
const selectActiveIndex = createSelector([selectFloorMetas, selectActiveFloorId], (metas, id) => Math.max(0, metas.findIndex((m) => m.id === id)));

/** Положение активного этажа. */
const selectActiveFrame = createSelector([selectFloorFrames, selectActiveIndex], (frames, index) => frames[index]);

/** Этаж под активным (null — активен первый этаж); не зависит от правок активного этажа. */
const selectFloorBelow = createSelector([selectFloorMetas, selectStash, selectFloorFrames, selectActiveIndex], (metas, stash, frames, index): BuildingFloor | null => {
  const meta = index > 0 ? metas[index - 1] : undefined;
  const content = meta && stash[meta.id];
  return meta && content ? { meta, content, frame: frames[index - 1] } : null;
});

/** Высота подъёма лестницы с активного этажа (до пола этажа выше). */
const selectActiveRise = createSelector([editorSelectors.selectDimensions, selectSlabThickness], (dims, slab) => floorRise(dims, slab));

/** Вырезы под лестницы с этажа ниже в координатах активного этажа (только внутри комнаты). */
const selectCutoutsFromBelow = createSelector([selectFloorBelow, selectActiveFrame, selectSlabThickness, editorSelectors.selectDimensions], (below, frame, slab, dims): Rect[] => {
  if (!below) return [];
  const interior = interiorRect(dims);
  return stairCutouts(below.content.stairs, floorRise(below.frame, slab))
    .map((r) => translateRect(r, [below.frame.offset[0] - frame.offset[0], below.frame.offset[1] - frame.offset[1]]))
    .map((r) => intersectRects(r, interior))
    .filter((r): r is Rect => r !== null);
});

/** Размеры каждого этажа (без мебели и стен: правка мебели их не меняет). */
const selectFloorDimensions = createSelector(
  [selectFloorMetas, selectStash, selectActiveFloorId, editorSelectors.selectDimensions],
  (metas, stash, activeId, dims) => metas.map((m) => (m.id === activeId ? dims : stash[m.id]?.dimensions ?? dims)),
);

/** Пол каждого этажа в мире (плоскости телепорта в VR). */
const selectFloorPlanes = createSelector([selectFloorFrames, selectFloorDimensions], (frames, dims) =>
  frames.map((f, i) => ({ id: f.id, base: f.base, offset: f.offset, width: dims[i].width, depth: dims[i].depth })),
);

/** Габариты здания на плане (мир); та же ссылка, пока габариты не изменились. */
const selectBuildingBounds = createSelector([selectFloors], buildingBounds, { memoizeOptions: { resultEqualityCheck: rectEqual } });

/** Участок вокруг здания (мир); та же ссылка, пока участок не изменился. */
const selectBuildingLot = createSelector([selectFloors], buildingLot, { memoizeOptions: { resultEqualityCheck: rectEqual } });

/** Высота здания до крыши верхнего этажа, м. */
const selectBuildingHeight = createSelector([selectFloorFrames, selectSlabThickness], (frames, slab) => roofLevel(frames[frames.length - 1], slab));

const walkBuilder = createWalkBuilder();

/** Мир для хождения от первого лица и в VR (пересчитывается только изменившийся этаж). */
const selectWalkWorld = createSelector([selectFloors, selectSlabThickness, selectBuildingLot], (floors, slab, lot) =>
  walkBuilder(
    floors.map((f) => ({ frame: f.frame, content: f.content, layout: cachedWallLayout(f.content.dimensions, f.content.partitions) })),
    slab,
    lot,
  ),
);

export const buildingSelectors = {
  selectFloorMetas,
  selectActiveFloorId,
  selectSlabThickness,
  selectBuildingState: root,
  selectActiveFloorContent,
  selectFloorFrames,
  selectFloors,
  selectActiveIndex,
  selectActiveFrame,
  selectFloorBelow,
  selectActiveRise,
  selectCutoutsFromBelow,
  selectBuildingBounds,
  selectBuildingLot,
  selectBuildingHeight,
  selectFloorPlanes,
  selectWalkWorld,
};
