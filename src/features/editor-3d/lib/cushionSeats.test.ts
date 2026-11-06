import { describe, expect, it } from 'vitest';
import { add2, length2, rotateLocal, scale2, sub2, type Vec2 } from '@/shared/lib/math/geometry2d';
import { cushionSockets } from '@/features/furniture/lib/cushions';
import { KNOWN_MODEL_SIZES, MODELS } from '@/features/furniture/lib/knownSizes';
import type { FurnitureItem } from '@/features/furniture/types';
import {
  chooseSeat,
  cushionBox,
  cushionsCollide,
  fitsHost,
  hostUnderAim,
  itemBox,
  MAX_TWIST,
  seated,
  seatOptions,
  socketPose,
  twistedPose,
  type CushionHost,
} from './cushionSeats';
import { uprightSizes } from './placement';
import { backEdgeOffset } from './tilt';

const PILLOW = '/assets/models/pillow_linen_sand/pillow_linen_sand.gltf';
const SET = '/assets/models/throw_pillows_01/throw_pillows_01_1k.gltf';
const SINGLE = { upright: false };
const UPRIGHT = { upright: true };

const item = (id: string, path: string, x = 0, z = 0, yaw = 0, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  name: id,
  modelPath: path,
  position: [x, 0, z],
  rotation: [0, yaw, 0],
  scale: 1,
  ...KNOWN_MODEL_SIZES[path],
  ...extra,
});

const sofaHost = (x = 0, z = 0, yaw = 0, scale = 1): CushionHost => ({
  item: item('sofa', MODELS.sofa, x, z, yaw, { scale }),
  sockets: cushionSockets({ modelPath: MODELS.sofa }),
});
const socket = (host: CushionHost, id: string) => host.sockets.find((s) => s.id === id)!;
const pillow = (id = 'p') => item(id, PILLOW);

describe('положение подушки в месте', () => {
  it('у спинки нижняя задняя кромка касается точки места, наклон — как у места', () => {
    const host = sofaHost(1, -0.5, Math.PI / 2);
    const back = socket(host, 'back-1');
    const pose = socketPose(host.item, back, pillow(), SINGLE)!;
    const anchor = add2([1, -0.5], rotateLocal([back.position[0], back.position[2]], Math.PI / 2));
    const edge = add2(pose.center, scale2(rotateLocal([0, 1], pose.yaw), backEdgeOffset(uprightSizes(pillow()), pose.tilt)));
    expect(length2(sub2(edge, anchor))).toBeLessThan(1e-9);
    expect(pose.y).toBeCloseTo(0.38);
    expect(pose.tilt).toBe(back.tilt);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('на сиденье подушка лежит центром в точке места; масштаб дивана раздвигает места', () => {
    const big = sofaHost(0, 0, 0, 1.5);
    const seat = socket(big, 'seat-2');
    const pose = socketPose(big.item, seat, pillow(), SINGLE)!;
    expect(pose.center[0]).toBeCloseTo(seat.position[0] * 1.5);
    expect(pose.center[1]).toBeCloseTo(seat.position[2] * 1.5);
    expect(pose.y).toBeCloseTo(0.38 * 1.5);
    expect(pose.tilt).toBeCloseTo(Math.PI / 2);
  });

  it('набор подушек ставится к спинке без наклона, на сиденье — нет', () => {
    const host = sofaHost();
    const set = item('set', SET);
    expect(socketPose(host.item, socket(host, 'seat-1'), set, UPRIGHT)).toBeNull();
    const pose = socketPose(host.item, socket(host, 'back-2'), set, UPRIGHT)!;
    expect(pose.tilt).toBe(0);
    // Задняя грань набора — в точке места
    expect(pose.center[1] - uprightSizes(set).halfDepth).toBeCloseTo(socket(host, 'back-2').position[2]);
  });

  it('посаженная подушка помнит диван и место, наклон хранится в rotation[0]', () => {
    const host = sofaHost();
    const pose = socketPose(host.item, socket(host, 'back-1'), pillow(), SINGLE)!;
    const result = seated(pillow(), host.item, 'back-1', pose);
    expect(result).toMatchObject({ supportId: 'sofa', socket: 'back-1' });
    expect(result.rotation[0]).toBeCloseTo(-pose.tilt);
    // Занятое место совпадает с расчётным
    expect(itemBox(result).footprint.half[1]).toBeCloseTo(cushionBox(pillow(), pose).footprint.half[1]);
  });
});

describe('свободные места', () => {
  it('мягкие подушки могут касаться, но не входить друг в друга', () => {
    const box = (x: number, y = 0.4) => ({ footprint: { center: [x, 0] as Vec2, half: [0.2, 0.1] as Vec2, angle: 0 }, yRange: [y, y + 0.4] as const });
    expect(cushionsCollide(box(0), box(0.37))).toBe(false);
    expect(cushionsCollide(box(0), box(0.3))).toBe(true);
    expect(cushionsCollide(box(0), box(0.3, 0.9))).toBe(false);
  });

  it('в кресло не садится слишком широкий набор подушек, на диван — садится', () => {
    const armchair = item('armchair', MODELS.armchair);
    const set = item('set', SET);
    const armchairHost = { item: armchair, sockets: cushionSockets({ modelPath: MODELS.armchair }) };
    expect(seatOptions(armchairHost, set, UPRIGHT, [])).toEqual([]);
    const pose = socketPose(sofaHost().item, socket(sofaHost(), 'back-2'), set, UPRIGHT)!;
    expect(fitsHost(cushionBox(set, pose), sofaHost().item)).toBe(true);
  });

  it('выбирается ближайшее свободное место; занятое пропускается', () => {
    const host = sofaHost();
    const nearBack1: Vec2 = [-0.42, -0.2];
    expect(chooseSeat(host, pillow(), SINGLE, nearBack1, [])?.socket.id).toBe('back-1');
    const taken = seated(pillow('a'), host.item, 'back-1', socketPose(host.item, socket(host, 'back-1'), pillow('a'), SINGLE)!);
    const choice = chooseSeat(host, pillow(), SINGLE, nearBack1, [taken])!;
    expect(choice.free).toBe(true);
    expect(choice.socket.id).not.toBe('back-1');
  });

  it('места у спинки и на сиденье дивана не мешают друг другу', () => {
    const host = sofaHost();
    const all = host.sockets.reduce<FurnitureItem[]>((acc, s, i) => {
      const cushion = pillow(`p${i}`);
      return [...acc, seated(cushion, host.item, s.id, socketPose(host.item, s, cushion, SINGLE)!)];
    }, []);
    expect(seatOptions(host, pillow('new'), SINGLE, []).every((o) => o.free)).toBe(true);
    // Все пять мест заняты — свободных нет, предлагается ближайшее занятое
    const full = chooseSeat(host, pillow('new'), SINGLE, [0, 0], all)!;
    expect(full.free).toBe(false);
    // А сами подушки друг другу не мешают
    all.forEach((a, i) => all.slice(i + 1).forEach((b) => expect(cushionsCollide(itemBox(a), itemBox(b))).toBe(false)));
  });

  it('выбор призрака сохраняется, если место свободно', () => {
    const host = sofaHost();
    expect(chooseSeat(host, pillow(), SINGLE, [-0.42, -0.2], [], 'seat-2')?.socket.id).toBe('seat-2');
  });
});

describe('куда целится пользователь', () => {
  const hosts = [sofaHost(0, 0), { ...sofaHost(3, 0), item: item('sofa2', MODELS.sofa, 3, 0) }];

  it('луч сверху попадает на диван — точка на высоте сиденья', () => {
    const hit = hostUnderAim(hosts, [0, 0], { origin: [3.2, 2, 0.5], direction: [0, -1, -0.2] })!;
    expect(hit.host.item.id).toBe('sofa2');
    expect(hit.point[0]).toBeCloseTo(3.2);
    expect(hit.point[1]).toBeCloseTo(0.5 - 0.2 * (2 - 0.38));
  });

  it('луч мимо диванов или вверх — ничего; на плане — диван под точкой', () => {
    expect(hostUnderAim(hosts, [0, 0], { origin: [1.5, 2, 2], direction: [0, -1, 0] })).toBeNull();
    expect(hostUnderAim(hosts, [0, 0], { origin: [0, 1, 0], direction: [0, 1, 0] })).toBeNull();
    expect(hostUnderAim(hosts, [3.1, 0.1])?.host.item.id).toBe('sofa2');
    expect(hostUnderAim(hosts, [1.5, 0])).toBeNull();
  });
});

describe('доворот подушки в месте', () => {
  it('ограничен ±35° от направления места', () => {
    const host = sofaHost(0, 0, 0.3);
    const back = socket(host, 'back-1');
    expect(twistedPose(host.item, back, pillow(), SINGLE, 0.3 + 0.2)!.yaw).toBeCloseTo(0.5);
    expect(twistedPose(host.item, back, pillow(), SINGLE, 0.3 + Math.PI / 2)!.yaw).toBeCloseTo(0.3 + MAX_TWIST);
    expect(twistedPose(host.item, back, pillow(), SINGLE, 0.3 - Math.PI / 2)!.yaw).toBeCloseTo(0.3 - MAX_TWIST);
  });
});
