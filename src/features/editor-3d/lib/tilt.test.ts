import { describe, expect, it } from 'vitest';
import { backEdgeOffset, itemTilt, tiltedExtent, tiltPivot } from './tilt';

const pillow = { halfDepth: 0.07, height: 0.45 };
const deg = (v: number) => (v * Math.PI) / 180;

/** Углы бокса подушки после поворота назад на tilt вокруг нижней кромки и сдвига tiltPivot. */
function corners(tilt: number): Array<[number, number]> {
  const { lift, shift } = tiltPivot(pillow, tilt);
  return [0, pillow.height].flatMap((y) =>
    [-pillow.halfDepth, pillow.halfDepth].map((z): [number, number] => [
      y * Math.cos(tilt) + z * Math.sin(tilt) + lift,
      -y * Math.sin(tilt) + z * Math.cos(tilt) + shift,
    ]),
  );
}

describe('наклон подушки', () => {
  it('без наклона габариты и сдвиг не меняются', () => {
    expect(tiltedExtent(pillow, 0)).toBe(pillow);
    expect(tiltPivot(pillow, 0)).toEqual({ lift: 0, shift: 0 });
    expect(backEdgeOffset(pillow, 0)).toBeCloseTo(-0.07);
  });

  it('лёжа (90°) подушка занимает место высотой в свою толщину и глубиной в свою высоту', () => {
    const lying = tiltedExtent(pillow, Math.PI / 2);
    expect(lying.height).toBeCloseTo(0.14);
    expect(lying.halfDepth).toBeCloseTo(0.225);
  });

  it.each([0, 15, 25, 90])('при наклоне %i° низ лежит на месте, а занятое место — по центру', (angle) => {
    const tilt = deg(angle);
    const extent = tiltedExtent(pillow, tilt);
    const ys = corners(tilt).map((c) => c[0]);
    const zs = corners(tilt).map((c) => c[1]);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(extent.height);
    expect(Math.min(...zs)).toBeCloseTo(-extent.halfDepth);
    expect(Math.max(...zs)).toBeCloseTo(extent.halfDepth);
  });

  it('нижняя задняя кромка — там, где её указывает backEdgeOffset', () => {
    const tilt = deg(15);
    // Угол y = 0, z = -halfDepth после поворота и сдвига
    const edge = corners(tilt)[0];
    expect(edge[0]).toBeCloseTo(0);
    expect(edge[1]).toBeCloseTo(backEdgeOffset(pillow, tilt));
  });

  it('наклон берётся из rotation[0] по модулю и не больше 90°', () => {
    expect(itemTilt([-deg(15), 1, 0])).toBeCloseTo(deg(15));
    expect(itemTilt([0, 2, 0])).toBe(0);
    expect(itemTilt([-3, 0, 0])).toBeCloseTo(Math.PI / 2);
  });
});
