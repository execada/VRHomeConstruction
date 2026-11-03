/**
 * Внешний вид стены: отделка на лицевых гранях и конструкционный материал в разрезе
 * (верх стены, виден в «кукольном домике» и сверху). У стены «Без отделки» материал
 * конструкции виден на всех гранях.
 * @module editor-3d/ui/scene/useWallLook
 */

import { useEffect, useLayoutEffect, useMemo } from 'react';
import { MeshStandardMaterial, type Material } from 'three';
import { isBareFinish } from '@/features/textures/lib/catalog';
import { proceduralTexture } from '@/features/textures/lib/textureCache';
import { useFinishMaterial, type FinishMaterial } from '@/features/textures/model/useFinishMaterial';
import { wallMaterialTexture } from '../../lib/wallMaterials';
import type { SurfaceFinish, WallMaterialId } from '../../types';

/** Материалы и размеры тайлов граней стены. */
export interface WallLook {
  /** Лицевые грани и откосы */
  face: Material;
  /** Верх стены (разрез) */
  top: Material;
  /** Размер тайла лицевых граней, м */
  faceTile: number;
  /** Размер тайла верха, м */
  topTile: number;
}

/** Материал конструкции стены (своя копия на стену — срез стен меняет состояние материала). */
function useStructureMaterial(id: WallMaterialId): FinishMaterial {
  const def = wallMaterialTexture(id);
  const map = useMemo(() => proceduralTexture(def), [def]);
  const material = useMemo(() => new MeshStandardMaterial({ metalness: 0 }), []);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    material.map = map;
    material.roughness = def.roughness;
    material.needsUpdate = true;
  }, [material, map, def]);

  return { material, tile: def.tileMeters };
}

/**
 * Материалы граней стены.
 * @param finish - отделка (или «Без отделки»)
 * @param materialId - конструкционный материал
 */
export function useWallLook(finish: SurfaceFinish, materialId: WallMaterialId): WallLook {
  const surface = useFinishMaterial(finish, 'wall');
  const structure = useStructureMaterial(materialId);
  const bare = isBareFinish(finish);
  return useMemo(
    () =>
      bare
        ? { face: structure.material, top: structure.material, faceTile: structure.tile, topTile: structure.tile }
        : { face: surface.material, top: structure.material, faceTile: surface.tile, topTile: structure.tile },
    [bare, surface.material, surface.tile, structure.material, structure.tile],
  );
}
