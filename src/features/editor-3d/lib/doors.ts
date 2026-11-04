/**
 * Двери: реестр моделей (процедурные полотна — размеры всегда точно по проёму),
 * параметры установленной двери (петли, сторона открывания, открыта ли),
 * геометрия коробки, полотен и петель, а также «препятствия» для хождения.
 *
 * Координаты — локальные координаты проёма: x — вдоль стены от центра проёма,
 * y — от пола, z — поперёк стены (+z — сторона нормали стены; у внешних стен это комната).
 * @module editor-3d/lib/doors
 */

import { isHexColor } from '@/shared/lib/color/colorTemperature';
import type { Opening } from '../types';

/** Рисунок полотна. */
export type DoorLeafDesign = 'flush' | 'panel' | 'glazed' | 'glass';

/** Описание модели двери. */
export interface DoorStyleDef {
  readonly id: string;
  readonly label: string;
  /** Количество створок */
  readonly leaves: 1 | 2;
  readonly design: DoorLeafDesign;
}

const defineDoorStyles = <const T extends readonly DoorStyleDef[]>(defs: T): T => defs;

/** Модели дверей (добавить модель — одна запись). */
export const DOOR_STYLES = defineDoorStyles([
  { id: 'flush', label: 'Гладкая', leaves: 1, design: 'flush' },
  { id: 'panel', label: 'Филёнчатая', leaves: 1, design: 'panel' },
  { id: 'glazed', label: 'Со стеклом', leaves: 1, design: 'glazed' },
  { id: 'glass', label: 'Стеклянная', leaves: 1, design: 'glass' },
  { id: 'double', label: 'Двустворчатая', leaves: 2, design: 'glazed' },
]);

/** Идентификатор модели двери. */
export type DoorStyleId = (typeof DOOR_STYLES)[number]['id'];

/** Список идентификаторов (для схемы документа). */
export const DOOR_STYLE_IDS = DOOR_STYLES.map((s) => s.id) as [DoorStyleId, ...DoorStyleId[]];

/** Установленная в проём дверь. */
export interface DoorSpec {
  style: DoorStyleId;
  /** Петли у начала (u−) или у конца (u+) проёма */
  hinge: 'start' | 'end';
  /** Открывается в сторону нормали стены (front: у внешних стен — в комнату) или обратно */
  swing: 'front' | 'back';
  open: boolean;
  /** Цвет полотна */
  color: string;
}

/** Дверь по умолчанию: филёнчатая, светлая, закрыта, открывается в комнату. */
export const DEFAULT_DOOR: DoorSpec = { style: 'panel', hinge: 'start', swing: 'front', open: false, color: '#efe9df' };

/** Дверь, которую получают двери из старых проектов (раньше рисовалось гладкое полотно). */
export const LEGACY_DOOR: DoorSpec = { ...DEFAULT_DOOR, style: 'flush', color: '#c8b49a' };

/** Размеры деталей двери, м. */
export const DOOR_PARTS = {
  /** Ширина бруса коробки (вдоль стены и над проёмом) */
  frame: 0.05,
  /** Толщина полотна */
  leaf: 0.04,
  /** Зазор полотна в коробке */
  gap: 0.004,
  /** Зазор под полотном */
  floorGap: 0.01,
  /** Ширина наличника */
  casing: 0.07,
  /** Угол открытой двери, рад */
  openAngle: Math.PI / 2,
} as const;

/** Описание модели по id (неизвестный — по умолчанию). */
export function doorStyle(id: string | undefined): DoorStyleDef {
  return DOOR_STYLES.find((s) => s.id === id) ?? DOOR_STYLES[1];
}

/**
 * Привести параметры двери к допустимым (недоверенный источник, частичное изменение).
 * @param patch - новые значения
 * @param base - текущие значения
 */
export function normalizeDoor(patch: Partial<DoorSpec> | undefined, base: DoorSpec = DEFAULT_DOOR): DoorSpec {
  const p = patch ?? {};
  return {
    style: DOOR_STYLES.some((s) => s.id === p.style) ? (p.style as DoorStyleId) : base.style,
    hinge: p.hinge === 'start' || p.hinge === 'end' ? p.hinge : base.hinge,
    swing: p.swing === 'front' || p.swing === 'back' ? p.swing : base.swing,
    open: typeof p.open === 'boolean' ? p.open : base.open,
    color: isHexColor(p.color) ? p.color : base.color,
  };
}

/** Створка: петля (ось вращения) и размеры полотна в координатах проёма. */
export interface DoorLeaf {
  /** Ось петель [x, z] (на грани стены со стороны открывания) */
  hinge: readonly [number, number];
  /** Направление от петель к притвору вдоль стены (±1) */
  toLatch: 1 | -1;
  width: number;
  height: number;
  /** Знак угла поворота группы петли (three.js, вокруг +Y), при котором створка открывается */
  openSign: 1 | -1;
}

/**
 * Створки двери в проёме ширины `opening.width` в стене толщины `thickness`.
 * Закрытое полотно — заподлицо с гранью стены со стороны открывания.
 */
export function doorLeaves(opening: Pick<Opening, 'width' | 'height'>, door: DoorSpec, thickness: number): DoorLeaf[] {
  const { frame, gap, floorGap } = DOOR_PARTS;
  const clear = opening.width - frame * 2 - gap * 2;
  const height = opening.height - frame - floorGap;
  const z = (door.swing === 'front' ? 1 : -1) * (thickness / 2);
  const swing = door.swing === 'front' ? 1 : -1;
  const leaf = (side: 1 | -1, width: number): DoorLeaf => {
    const toLatch = (-side) as 1 | -1;
    return { hinge: [side * (clear / 2), z], toLatch, width, height, openSign: (-swing * toLatch) as 1 | -1 };
  };
  if (doorStyle(door.style).leaves === 2) return [leaf(-1, clear / 2 - gap / 2), leaf(1, clear / 2 - gap / 2)];
  return [leaf(door.hinge === 'start' ? -1 : 1, clear)];
}

/** Прямоугольник на полу в координатах проёма: центр [x, z] и полуразмеры. */
export interface DoorFootprint {
  center: readonly [number, number];
  half: readonly [number, number];
}

/**
 * Что мешает пройти через дверной проём: закрытая дверь перекрывает проём целиком,
 * открытая — полотно, развёрнутое у петель, и брусья коробки. Пустой проём проходим.
 * @param opening - размеры проёма
 * @param door - установленная дверь (нет — пустой проём)
 * @param thickness - толщина стены
 */
export function doorFootprints(opening: Pick<Opening, 'width' | 'height'>, door: DoorSpec | undefined, thickness: number): DoorFootprint[] {
  if (!door) return [];
  const { frame, leaf } = DOOR_PARTS;
  const half = Math.max(thickness / 2, leaf);
  if (!door.open) return [{ center: [0, 0], half: [opening.width / 2, half] }];
  const jambs: DoorFootprint[] = [-1, 1].map((s) => ({ center: [s * (opening.width / 2 - frame / 2), 0], half: [frame / 2, thickness / 2] }));
  const swing = door.swing === 'front' ? 1 : -1;
  const leaves = doorLeaves(opening, door, thickness).map((l): DoorFootprint => ({
    center: [l.hinge[0] + (l.toLatch * leaf) / 2, l.hinge[1] + (swing * l.width) / 2],
    half: [leaf / 2, l.width / 2],
  }));
  return [...jambs, ...leaves];
}

/**
 * Петли «слева» или «справа», если смотреть на дверь с той стороны, куда она открывается.
 * Со стороны нормали (+z) правая рука смотрит в +x (к концу стены).
 */
export function hingeHand(door: Pick<DoorSpec, 'hinge' | 'swing'>): 'left' | 'right' {
  return (door.swing === 'front') === (door.hinge === 'end') ? 'right' : 'left';
}

/** Сторона петель для выбранной «руки» двери. */
export function hingeForHand(hand: 'left' | 'right', swing: DoorSpec['swing']): DoorSpec['hinge'] {
  return (hand === 'right') === (swing === 'front') ? 'end' : 'start';
}
