import { describe, expect, it, vi } from 'vitest';
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import type { TextureDef } from '../types';

const loadAsync = vi.hoisted(() => vi.fn());
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, TextureLoader: class { loadAsync = loadAsync; } };
});

import { loadTexture, proceduralTexture, texturePatternImage, textureThumbnail } from './textureCache';

describe('loadTexture', () => {
  it('настраивает повтор и цветовое пространство; файл грузится один раз', async () => {
    loadAsync.mockResolvedValue(new Texture());
    const [a, b] = await Promise.all([loadTexture('/t/color.jpg', true), loadTexture('/t/color.jpg', true)]);
    expect(a).toBe(b);
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(a.wrapS).toBe(RepeatWrapping);
    expect(a.colorSpace).toBe(SRGBColorSpace);

    loadAsync.mockResolvedValue(new Texture());
    expect((await loadTexture('/t/normal.jpg', false)).colorSpace).toBe(NoColorSpace);
  });

  it('после ошибки загрузку можно повторить', async () => {
    loadAsync.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(new Texture());
    await expect(loadTexture('/t/broken.jpg', true)).rejects.toThrow('404');
    await new Promise((r) => setTimeout(r, 0));
    await expect(loadTexture('/t/broken.jpg', true)).resolves.toBeInstanceOf(Texture);
  });
});

describe('процедурные текстуры без DOM', () => {
  const def: TextureDef = { id: 'p', label: 'P', category: 'floor', tileMeters: 1, roughness: 1, draw: () => undefined };

  it('без document текстура и превью не создаются', () => {
    expect(proceduralTexture(def)).toBeNull();
    expect(textureThumbnail(def)).toBeNull();
  });

  it('готовое превью из каталога возвращается как есть', () => {
    expect(textureThumbnail({ ...def, thumbnail: '/t/thumb.jpg' })).toBe('/t/thumb.jpg');
  });
});

describe('texturePatternImage', () => {
  const base: TextureDef = { id: 'marble', label: 'Мрамор', category: 'floor', tileMeters: 1, roughness: 0.4 };

  it('для текстуры из манифеста — карта цвета, а не превью (превью бывает рендером шара)', () => {
    const def: TextureDef = { ...base, thumbnail: '/assets/textures/marble/thumb.jpg', maps: { color: '/assets/textures/marble/color.jpg' } };
    expect(texturePatternImage(def)).toBe('/assets/textures/marble/color.jpg');
  });

  it('без карт — готовое превью', () => {
    expect(texturePatternImage({ ...base, thumbnail: 'data:image/png;base64,AAAA' })).toBe('data:image/png;base64,AAAA');
  });
});
