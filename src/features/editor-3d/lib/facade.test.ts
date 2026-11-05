import { describe, expect, it } from 'vitest';
import { FACADE_MODULE, FACADE_MODULE_METERS, facadePixels } from './facade';

const pixel = (data: Uint8Array, width: number, x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('facadePixels', () => {
  const facade = facadePixels(256, 256, 3);
  const panelW = 256 / FACADE_MODULE.columns;
  const floorH = 256 / FACADE_MODULE.floors;

  it('describes the module in meters', () => {
    expect(FACADE_MODULE_METERS).toEqual({ width: 12, height: 14.4 });
  });

  it('fills both maps completely', () => {
    expect(facade.color).toHaveLength(256 * 256 * 4);
    expect(facade.lit).toHaveLength(256 * 256 * 4);
  });

  it('draws light mullions, dark spandrels and glass in between', () => {
    const mullion = pixel(facade.color, 256, panelW, Math.round(floorH * 0.6));
    const spandrel = pixel(facade.color, 256, Math.round(panelW / 2), Math.round(floorH * 0.1));
    const glass = pixel(facade.color, 256, Math.round(panelW / 2), Math.round(floorH * 0.6));
    expect(mullion[0]).toBeGreaterThan(180);
    expect(spandrel[0]).toBeLessThan(60);
    expect(glass[0]).toBeGreaterThan(spandrel[0]);
    expect(glass[0]).toBeLessThan(mullion[0]);
  });

  it('lights only glass, a share of the windows, deterministically', () => {
    const again = facadePixels(256, 256, 3);
    expect(again.lit).toEqual(facade.lit);
    let lit = 0;
    for (let floor = 0; floor < FACADE_MODULE.floors; floor += 1) {
      for (let column = 0; column < FACADE_MODULE.columns; column += 1) {
        const glass = pixel(facade.lit, 256, Math.round((column + 0.5) * panelW), Math.round((floor + 0.6) * floorH));
        if (glass[0] > 0) lit += 1;
        const spandrel = pixel(facade.lit, 256, Math.round((column + 0.5) * panelW), Math.round((floor + 0.1) * floorH));
        expect(spandrel[0]).toBe(0);
      }
    }
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(FACADE_MODULE.columns * FACADE_MODULE.floors);
  });

  it('draws light stone walls with dark punched windows for city blocks', () => {
    const wall = facadePixels(256, 256, 3, 'punched');
    const pier = pixel(wall.color, 256, 2, Math.round(floorH * 0.6));
    const sill = pixel(wall.color, 256, Math.round(panelW / 2), Math.round(floorH * 0.1));
    const window = pixel(wall.color, 256, Math.round(panelW / 2), Math.round(floorH * 0.6));
    expect(pier[0]).toBeGreaterThan(190);
    expect(sill[0]).toBeGreaterThan(190);
    expect(window[0]).toBeLessThan(110);
    expect(pixel(wall.lit, 256, 2, Math.round(floorH * 0.6))[0]).toBe(0);
  });
});
