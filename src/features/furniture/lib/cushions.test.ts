import { describe, expect, it } from 'vitest';
import { BACK_TILT, cushionSockets, cushionStyle, fallbackSockets, SEAT_TILT } from './cushions';
import { KNOWN_MODEL_SIZES, MODELS } from './knownSizes';

const M = '/assets/models';
const PILLOW_VELVET = `${M}/pillow_velvet_ochre/pillow_velvet_ochre.gltf`;
const PILLOW_SET = `${M}/throw_pillows_01/throw_pillows_01_1k.gltf`;
const GLAM_SOFA = `${M}/glam_velvet_sofa/glam_velvet_sofa.gltf`;
const deg = (v: number) => (v * Math.PI) / 180;

describe('подушки каталога', () => {
  it('одиночная подушка садится с наклоном места, набор подушек — ровно и только к спинке', () => {
    expect(cushionStyle({ modelPath: PILLOW_VELVET })).toEqual({ upright: false });
    expect(cushionStyle({ modelPath: PILLOW_SET })).toEqual({ upright: true });
  });

  it('диван и стол каталога — не подушки, даже если в названии есть «подушка»', () => {
    expect(cushionStyle({ modelPath: MODELS.sofa })).toBeNull();
    expect(cushionStyle({ modelPath: MODELS.diningTable, name: 'Стол под подушки' })).toBeNull();
  });

  it('свою модель узнаёт по названию или имени файла', () => {
    expect(cushionStyle({ modelPath: '/models/cushion_red.glb' })).toEqual({ upright: false });
    expect(cushionStyle({ modelPath: '/models/thing.glb', name: 'Подушка для дивана' })).toEqual({ upright: false });
    expect(cushionStyle({ modelPath: '/models/lamp.glb', name: 'Лампа' })).toBeNull();
  });
});

describe('посадочные места', () => {
  it('диван каталога: три места у спинки и два на сиденье, наклоны по умолчанию', () => {
    const sockets = cushionSockets({ modelPath: MODELS.sofa });
    expect(sockets.map((s) => s.id)).toEqual(['back-1', 'back-2', 'back-3', 'seat-1', 'seat-2']);
    expect(sockets.filter((s) => s.kind === 'back').every((s) => s.tilt === BACK_TILT && s.yaw === 0)).toBe(true);
    expect(sockets.filter((s) => s.kind === 'seat').every((s) => s.tilt === SEAT_TILT)).toBe(true);
    // Все места — на сиденье дивана (высота 0,38 м) и в пределах его габарита
    const sizes = KNOWN_MODEL_SIZES[MODELS.sofa];
    sockets.forEach((s) => {
      expect(s.position[1]).toBeCloseTo(0.38);
      expect(Math.abs(s.position[0])).toBeLessThan(sizes.halfWidth);
      expect(Math.abs(s.position[2])).toBeLessThan(sizes.halfDepth);
    });
  });

  it('углы из манифеста переводятся в радианы: изогнутая спинка и откинутое кресло', () => {
    const glam = cushionSockets({ modelPath: GLAM_SOFA });
    expect(glam.find((s) => s.id === 'back-1')?.yaw).toBeCloseTo(deg(11));
    expect(glam.find((s) => s.id === 'back-3')?.yaw).toBeCloseTo(deg(-22));
    const armchair = cushionSockets({ modelPath: MODELS.armchair });
    expect(armchair.find((s) => s.kind === 'back')?.tilt).toBeCloseTo(deg(25));
  });

  it('у моделей каталога без мест (стол, подушка) мест нет', () => {
    expect(cushionSockets({ modelPath: MODELS.diningTable })).toEqual([]);
    expect(cushionSockets({ modelPath: PILLOW_VELVET })).toEqual([]);
  });

  it('свой диван: места раскладываются по ширине сиденья между подлокотниками', () => {
    const sizes = { halfWidth: 1, halfDepth: 0.45, height: 0.85 };
    const sockets = cushionSockets({ modelPath: '/models/my_sofa.glb', name: 'Мой диван', sizes });
    const back = sockets.filter((s) => s.kind === 'back');
    const seat = sockets.filter((s) => s.kind === 'seat');
    expect(back).toHaveLength(3);
    expect(seat).toHaveLength(2);
    expect(new Set(sockets.map((s) => s.id)).size).toBe(sockets.length);
    // Симметрично, внутри подлокотников, спинка позади сиденья
    expect(back[0].position[0]).toBeCloseTo(-back[2].position[0]);
    expect(Math.abs(back[0].position[0])).toBeLessThan(sizes.halfWidth * 0.8);
    expect(back[0].position[2]).toBeLessThan(seat[0].position[2]);
    expect(back[0].position[1]).toBeCloseTo(0.425);
  });

  it('узкое кресло — одно место у спинки и одно на сиденье; высота сиденья в разумных пределах', () => {
    const sockets = fallbackSockets({ halfWidth: 0.4, halfDepth: 0.4, height: 1.4 });
    expect(sockets.map((s) => s.kind)).toEqual(['back', 'seat']);
    expect(sockets[0].position[0]).toBeCloseTo(0);
    expect(sockets[0].position[1]).toBe(0.6);
  });

  it('у своих стульев, подушек и моделей без габаритов мест нет', () => {
    const sizes = { halfWidth: 0.25, halfDepth: 0.25, height: 0.9 };
    expect(cushionSockets({ modelPath: '/models/chair.glb', name: 'Стул', sizes })).toEqual([]);
    expect(cushionSockets({ modelPath: '/models/sofa_pillow.glb', sizes })).toEqual([]);
    expect(cushionSockets({ modelPath: '/models/sofa.glb' })).toEqual([]);
  });
});
