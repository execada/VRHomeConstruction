import { describe, expect, it } from 'vitest';
import { WALL_MATERIALS } from '@/features/editor-3d/lib/wallMaterials';
import { bondTexture } from './structureTextures';

/** Минимальный 2D-контекст: записывает вызовы и цвета заливки, хранит пиксели для шума. */
function fakeContext(size: number) {
  const calls: string[] = [];
  const fills: string[] = [];
  const image = { data: new Uint8ClampedArray(size * size * 4).fill(128) };
  const target: Record<string, unknown> = {
    getImageData: () => image,
    putImageData: () => calls.push('putImageData'),
  };
  const ctx = new Proxy(target, {
    get: (t, prop: string) => (prop in t ? t[prop] : (...args: unknown[]) => calls.push(`${prop}(${args.length})`)),
    set: (t, prop: string, value) => {
      if (prop === 'fillStyle') fills.push(String(value));
      t[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, fills, image };
}

describe('structure textures', () => {
  it.each(WALL_MATERIALS.map((m) => [m.id, m] as const))('%s draws without errors', (_id, m) => {
    const { ctx, calls } = fakeContext(32);
    expect(() => m.look.draw(ctx, 32)).not.toThrow();
    expect(calls.length).toBeGreaterThan(5);
  });

  it('is deterministic', () => {
    const draw = WALL_MATERIALS[0].look.draw;
    const a = fakeContext(16);
    const b = fakeContext(16);
    draw(a.ctx, 16);
    draw(b.ctx, 16);
    expect(a.fills).toEqual(b.fills);
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });

  it('wraps block colours so the tile is seamless', () => {
    const draw = bondTexture({ columns: 2, rows: 2, joint: 0.1, mortar: '#000000', hue: [0, 360], sat: [50, 50], light: [50, 50], noise: 0, seed: 3 });
    const { ctx, fills } = fakeContext(8);
    draw(ctx, 8);
    // Ряд: блок −1, 0, 1, 2 (= 0, 0, 1, 0 по модулю): крайние блоки повторяют противоположные.
    const row0 = fills.slice(1, 5);
    expect(row0[0]).toBe(row0[2]);
    expect(row0[3]).toBe(row0[1]);
  });
});
