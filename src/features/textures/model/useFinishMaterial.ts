/**
 * Хук материала отделки поверхности (текстура + тонирование + шероховатость).
 * PBR-карты загружаются асинхронно; пока они грузятся, поверхность показывается цветом.
 * @module textures/model/useFinishMaterial
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { FrontSide, MeshStandardMaterial, type Side, type Texture } from 'three';
import type { SurfaceFinish } from '@/features/editor-3d/types';
import { resolveTexture } from '../lib/catalog';
import { loadTexture, proceduralTexture } from '../lib/textureCache';
import type { TextureCategory, TextureDef } from '../types';
import { selectTextureCatalog } from './selectors';

interface TextureMaps {
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
}

/** Материал поверхности и размер тайла для UV геометрии. */
export interface FinishMaterial {
  material: MeshStandardMaterial;
  /** Размер тайла текстуры, м (с учётом масштаба отделки) */
  tile: number;
}

/** Загрузить карты текстуры (null — однотонная поверхность). */
function useTextureMaps(def: TextureDef | null): TextureMaps | null {
  const [maps, setMaps] = useState<TextureMaps | null>(null);

  useEffect(() => {
    if (!def) {
      setMaps(null);
      return undefined;
    }
    if (def.draw) {
      setMaps({ map: proceduralTexture(def), normalMap: null, roughnessMap: null });
      return undefined;
    }
    let cancelled = false;
    const files = def.maps;
    if (!files) return undefined;
    Promise.all([
      loadTexture(files.color, true),
      files.normal ? loadTexture(files.normal, false) : Promise.resolve(null),
      files.roughness ? loadTexture(files.roughness, false) : Promise.resolve(null),
    ])
      .then(([map, normalMap, roughnessMap]) => {
        if (!cancelled) setMaps({ map, normalMap, roughnessMap });
      })
      .catch((error) => {
        console.warn(`Не удалось загрузить текстуру «${def.id}»`, error);
        if (!cancelled) setMaps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [def]);

  return maps;
}

/**
 * Материал для отделки поверхности.
 * @param finish - отделка (текстура, цвет тонирования, масштаб)
 * @param category - тип поверхности (для запасной текстуры и шероховатости)
 * @param side - сторона отрисовки
 */
export function useFinishMaterial(finish: SurfaceFinish, category: TextureCategory, side: Side = FrontSide): FinishMaterial {
  const catalog = useSelector(selectTextureCatalog);
  const def = useMemo(() => resolveTexture(catalog, finish.textureId, category), [catalog, finish.textureId, category]);
  const maps = useTextureMaps(def);
  const material = useMemo(() => new MeshStandardMaterial({ side, metalness: 0 }), [side]);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    material.color.set(finish.color);
    material.map = maps?.map ?? null;
    material.normalMap = maps?.normalMap ?? null;
    material.roughnessMap = maps?.roughnessMap ?? null;
    material.roughness = maps?.roughnessMap ? 1 : def?.roughness ?? 0.9;
    material.needsUpdate = true;
  }, [material, finish.color, maps, def]);

  return { material, tile: (def?.tileMeters ?? 1) * finish.scale };
}
