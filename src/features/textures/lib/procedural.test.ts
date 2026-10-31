import { describe, expect, it } from 'vitest';
import { PROCEDURAL_TEXTURES } from './procedural';

/** Минимальный 2D-контекст: записывает вызовы, хранит пиксели для шума. */
function fakeContext(size: number) {
  const calls: string[] = [];
  const image = { data: new Uint8ClampedArray(size * size * 4).fill(128) };
  const ctx = new Proxy(
    {
      getImageData: () => image,
      putImageData: () => calls.push('putImageData'),
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      createRadialGradient: () => ({ addColorStop: () => undefined }),
    } as Record<string, unknown>,
    {
      get: (target, prop: string) => (prop in target ? target[prop] : (...args: unknown[]) => calls.push(`${prop}(${args.length})`)),
      set: (target, prop: string, value) => {
        target[prop] = value;
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, image };
}

describe('procedural textures', () => {
  it('у каждой текстуры уникальный id, категория и положительный размер тайла', () => {
    const ids = PROCEDURAL_TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of PROCEDURAL_TEXTURES) {
      expect(['floor', 'wall', 'ceiling']).toContain(t.category);
      expect(t.tileMeters).toBeGreaterThan(0);
      expect(t.roughness).toBeGreaterThan(0);
    }
  });

  it.each(PROCEDURAL_TEXTURES.map((t) => [t.id, t] as const))('%s рисуется без ошибок', (_id, def) => {
    const { ctx, calls } = fakeContext(32);
    expect(() => def.draw?.(ctx, 32)).not.toThrow();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('шум детерминирован: одинаковый рисунок при каждой генерации', () => {
    const def = PROCEDURAL_TEXTURES.find((t) => t.id === 'wall-concrete');
    const a = fakeContext(16);
    const b = fakeContext(16);
    def?.draw?.(a.ctx, 16);
    def?.draw?.(b.ctx, 16);
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });
});
