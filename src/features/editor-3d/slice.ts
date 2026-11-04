/**
 * Redux Slice редактора 3D-сцены.
 * Управляет размерами комнаты, цветами, освещением,
 * проёмами, перегородками и активным инструментом.
 * @module editor-3d/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  EditorState,
  EditorScenePayload,
  FinishTarget,
  Opening,
  RoomColors,
  RoomDimensions,
  RoomMaterials,
  SurfaceFinish,
  ViewMode,
  Tool,
  Partition,
  LightConfig,
  OuterWalls,
  RoomLabel,
  WallSide,
} from './types';

const DEFAULT_MATERIALS: RoomMaterials = { walls: 'color', floor: 'color', ceiling: 'color' };

import {
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_DEPTH,
  DEFAULT_COLORS,
  DEFAULT_LIGHT,
  DEFAULT_FINISHES,
  DEFAULT_OUTER_WALLS,
} from './constants';

/** Начальное состояние редактора */
const initialState: EditorState = {
  dimensions: {
    width: DEFAULT_ROOM_WIDTH,
    height: DEFAULT_ROOM_HEIGHT,
    depth: DEFAULT_ROOM_DEPTH,
  },

  colors: DEFAULT_COLORS,

  materials: DEFAULT_MATERIALS,

  finishes: DEFAULT_FINISHES,

  outerWalls: DEFAULT_OUTER_WALLS,

  removedWalls: [],

  light: DEFAULT_LIGHT,

  viewMode: '3d',

  activeTool: 'select',

  openings: {},

  partitions: [],

  rooms: [],

  partitionColors: {},

  viewedWallId: 'front',

  selectedOpening: null,

  selectedPartition: null,

  currentProjectId: null,

  playerPosition: null,

  playerRotation: null,
};

export const slice = createSlice({
  name: 'editor',

  initialState,

  reducers: {
    /** Установить размеры комнаты */
    setDimensions(
        state,
        action: PayloadAction<RoomDimensions>
    ) {
      state.dimensions = action.payload;
    },

    /** Установить цвета */
    setColors(
        state,
        action: PayloadAction<RoomColors>
    ) {
      state.colors = action.payload;
    },

    /** Установить материал (текстуру) одной поверхности */
    setMaterial(
        state,
        action: PayloadAction<{ surface: keyof RoomMaterials; id: string }>
    ) {
      state.materials[action.payload.surface] = action.payload.id;
    },

    /** Настройки света */
    setLight(
        state,
        action: PayloadAction<LightConfig>
    ) {
      state.light = action.payload;
    },

    /** Режим просмотра */
    setViewMode(
        state,
        action: PayloadAction<ViewMode>
    ) {
      state.viewMode = action.payload;
    },

    /** Активный инструмент */
    setActiveTool(
        state,
        action: PayloadAction<Tool>
    ) {
      state.activeTool = action.payload;
    },

    /** Создание проёма */
    createOpeningRequested(
        _state,
        _action: PayloadAction<{
          wallId: string;
          point: { x: number; y: number };
        }>
    ) {},

    /** Добавить проём */
    addOpening(
        state,
        action: PayloadAction<{
          wallId: string;
          opening: Opening;
        }>
    ) {
      const { wallId, opening } = action.payload;

      if (!state.openings[wallId]) {
        state.openings[wallId] = [];
      }

      state.openings[wallId].push(opening);
    },

    /** Обновить проём */
    updateOpening(
        state,
        action: PayloadAction<{
          wallId: string;
          opening: Opening;
        }>
    ) {
      const { wallId, opening } = action.payload;

      if (state.openings[wallId]) {
        state.openings[wallId] =
            state.openings[wallId].map((o) =>
                o.id === opening.id ? opening : o
            );
      }
    },

    /** Удалить проём */
    deleteOpeningRequested(
        _state,
        _action: PayloadAction<{
          openingId: string;
        }>
    ) {},

    /** Remove opening */
    removeOpening(
        state,
        action: PayloadAction<{
          wallId: string;
          openingId: string;
        }>
    ) {
      const { wallId, openingId } = action.payload;

      if (state.openings[wallId]) {
        state.openings[wallId] =
            state.openings[wallId].filter(
                (o) => o.id !== openingId
            );

        if (state.openings[wallId].length === 0) {
          delete state.openings[wallId];
        }
      }
    },

    /** Просматриваемая стена */
    setViewedWallId(
        state,
        action: PayloadAction<string>
    ) {
      state.viewedWallId = action.payload;
    },

    /** Выбранный проём */
    setSelectedOpening(
        state,
        action: PayloadAction<EditorState['selectedOpening']>
    ) {
      state.selectedOpening = action.payload;
    },

    /** Добавить перегородку */
    addPartition(
        state,
        action: PayloadAction<Partition>
    ) {
      state.partitions.push(action.payload);
    },

    /** Обновить перегородку */
    updatePartition(
        state,
        action: PayloadAction<Partition>
    ) {
      state.partitions =
          state.partitions.map((p) =>
              p.id === action.payload.id
                  ? action.payload
                  : p
          );

      if (
          state.selectedPartition?.id ===
          action.payload.id
      ) {
        state.selectedPartition =
            action.payload;
      }
    },

    /** Удалить перегородку */
    removePartition(
        state,
        action: PayloadAction<string>
    ) {
      state.partitions =
          state.partitions.filter(
              (p) => p.id !== action.payload
          );

      delete state.partitionColors[action.payload];

      if (
          state.selectedPartition?.id ===
          action.payload
      ) {
        state.selectedPartition = null;
      }
    },

    /** Выделить перегородку */
    setSelectedPartition(
        state,
        action: PayloadAction<Partition | null>
    ) {
      state.selectedPartition =
          action.payload;
    },

    /** Добавить проём в перегородку */
    addOpeningToPartition(
        state,
        action: PayloadAction<{
          partitionId: string;
          opening: Opening;
        }>
    ) {
      const partition =
          state.partitions.find(
              (p) =>
                  p.id === action.payload.partitionId
          );

      if (partition) {
        partition.openings.push(
            action.payload.opening
        );
      }
    },

    /** Удалить проём из перегородки */
    removeOpeningFromPartition(
        state,
        action: PayloadAction<{
          partitionId: string;
          openingId: string;
        }>
    ) {
      const partition =
          state.partitions.find(
              (p) =>
                  p.id === action.payload.partitionId
          );

      if (partition) {
        partition.openings =
            partition.openings.filter(
                (o) =>
                    o.id !==
                    action.payload.openingId
            );
      }
    },

    /** Цвет перегородки */
    setPartitionColor(
        state,
        action: PayloadAction<{
          partitionId: string;
          color: string;
        }>
    ) {
      state.partitionColors[
          action.payload.partitionId
          ] = action.payload.color;
    },

    /** Удалить цвет перегородки */
    removePartitionColor(
        state,
        action: PayloadAction<string>
    ) {
      delete state.partitionColors[
          action.payload
          ];
    },

    /** Текущий проект */
    setCurrentProjectId(
        state,
        action: PayloadAction<string | null>
    ) {
      state.currentProjectId =
          action.payload;
    },

    /** Установить позицию персонажа */
    setPlayerPosition(
        state,
        action: PayloadAction<[number, number, number] | null>
    ) {
      state.playerPosition = action.payload;
    },

    /** Установить ротацию персонажа */
    setPlayerRotation(
        state,
        action: PayloadAction<[number, number, number] | null>
    ) {
      state.playerRotation = action.payload;
    },

    /** Загрузка RoomData */
    loadRoomData(
        state,
        action: PayloadAction<{
          dimensions: RoomDimensions;
          colors: RoomColors;
          materials?: RoomMaterials;
          light: LightConfig;
          openings: {
            [wallId: string]: Opening[];
          };
          partitions: Partition[];
          partitionColors: {
            [partitionId: string]: string;
          };
        }>
    ) {
      state.dimensions =
          action.payload.dimensions;

      state.colors =
          action.payload.colors;

      state.materials =
          action.payload.materials ?? DEFAULT_MATERIALS;

      state.light =
          action.payload.light;

      state.openings =
          action.payload.openings;

      state.partitions =
          action.payload.partitions;

      state.partitionColors =
          action.payload.partitionColors;
    },

    /** Отделка поверхности (`walls` — все четыре стены сразу) */
    setFinish(
        state,
        action: PayloadAction<{ target: FinishTarget; finish: SurfaceFinish }>
    ) {
      const { target, finish } = action.payload;

      if (target === 'floor' || target === 'ceiling') {
        state.finishes = { ...state.finishes, [target]: finish };
        return;
      }

      const walls = target === 'walls'
          ? { front: finish, back: finish, left: finish, right: finish }
          : { ...state.finishes.walls, [target]: finish };

      state.finishes = { ...state.finishes, walls };
    },

    /** Толщина и материал внешних стен */
    setOuterWalls(
        state,
        action: PayloadAction<OuterWalls>
    ) {
      state.outerWalls = action.payload;
    },

    /** Список удалённых (скрытых) внешних стен */
    setRemovedWalls(
        state,
        action: PayloadAction<WallSide[]>
    ) {
      state.removedWalls = action.payload;
    },

    /** Заменить все проёмы внешних стен (пересчёт после изменения размеров комнаты) */
    setOpenings(
        state,
        action: PayloadAction<{ [wallId: string]: Opening[] }>
    ) {
      state.openings = action.payload;
    },

    /** Названия и виды помещений */
    setRooms(
        state,
        action: PayloadAction<RoomLabel[]>
    ) {
      state.rooms = action.payload;
    },

    /** Заменить все перегородки (пересчёт после изменения размеров комнаты) */
    setPartitions(
        state,
        action: PayloadAction<Partition[]>
    ) {
      state.partitions = action.payload;
    },

    /** Загрузить сцену целиком (проект, шаблон, отмена/повтор) */
    loadScene(
        state,
        action: PayloadAction<EditorScenePayload>
    ) {
      const scene = action.payload;

      state.dimensions = scene.dimensions;
      state.finishes = scene.finishes;
      state.outerWalls = scene.outerWalls;
      state.removedWalls = scene.removedWalls;
      state.light = scene.light;
      state.openings = scene.openings;
      state.partitions = scene.partitions;
      state.rooms = scene.rooms;
      state.partitionColors = {};
      state.selectedOpening = null;
      state.selectedPartition = null;
    },

    /** Сброс редактора */
    resetEditor() {
      return initialState;
    },
  },
});

export const {
  actions,
  reducer,
  name,
} = slice;

export type { EditorState };