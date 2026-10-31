import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManifest } from './manifest';

describe('fetchManifest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('загружает и проверяет манифест', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hdris: [], textures: [], models: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchManifest()).resolves.toEqual({ hdris: [], textures: [], models: [] });
    expect(fetchMock).toHaveBeenCalledWith('/assets/manifest.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('понятная ошибка при недоступном каталоге', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(fetchManifest()).rejects.toThrow('Каталог ассетов недоступен (HTTP 503)');
  });
});
