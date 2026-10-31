/**
 * Загрузка и кэширование текстур three.js.
 * Одна текстура загружается один раз и разделяется всеми поверхностями
 * (тайлинг задаётся UV геометрии, а не repeat текстуры).
 * @module textures/lib/textureCache
 */

import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';
import type { TextureDef } from '../types';

const ANISOTROPY = 8;
const PROCEDURAL_SIZE = 256;

const loader = new TextureLoader();
const fileCache = new Map<string, Promise<Texture>>();
const proceduralCache = new Map<string, Texture>();
const thumbnailCache = new Map<string, string>();

function configure(texture: Texture, isColor: boolean): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = ANISOTROPY;
  texture.colorSpace = isColor ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Загрузить текстуру из файла (с кэшем; при ошибке кэш очищается для повторной попытки).
 * @param url - путь к файлу
 * @param isColor - карта цвета (sRGB) или данных (нормали, шероховатость)
 */
export function loadTexture(url: string, isColor: boolean): Promise<Texture> {
  const key = `${url}|${isColor ? 'srgb' : 'linear'}`;
  const cached = fileCache.get(key);
  if (cached) return cached;
  const promise = loader.loadAsync(url).then((texture) => configure(texture, isColor));
  promise.catch(() => fileCache.delete(key));
  fileCache.set(key, promise);
  return promise;
}

function drawCanvas(def: TextureDef, size: number): HTMLCanvasElement | null {
  if (!def.draw || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  def.draw(ctx, size);
  return canvas;
}

/** Процедурная текстура (рисуется один раз и кэшируется). */
export function proceduralTexture(def: TextureDef): Texture | null {
  const cached = proceduralCache.get(def.id);
  if (cached) return cached;
  const canvas = drawCanvas(def, PROCEDURAL_SIZE);
  if (!canvas) return null;
  const texture = configure(new CanvasTexture(canvas), true);
  proceduralCache.set(def.id, texture);
  return texture;
}

/** Превью текстуры для галереи (для процедурных — генерируется data URL). */
export function textureThumbnail(def: TextureDef): string | null {
  if (def.thumbnail) return def.thumbnail;
  const cached = thumbnailCache.get(def.id);
  if (cached) return cached;
  const canvas = drawCanvas(def, 96);
  if (!canvas) return null;
  const url = canvas.toDataURL('image/png');
  thumbnailCache.set(def.id, url);
  return url;
}
