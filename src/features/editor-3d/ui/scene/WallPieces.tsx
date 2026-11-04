/**
 * Тело внешней стены из прямоугольных кусков вокруг проёмов.
 * Лицевые грани и откосы — материал отделки, верх стены — материал конструкции (разрез);
 * UV в метрах — текстура непрерывна на всех кусках.
 * @module editor-3d/ui/scene/WallPieces
 */

import React, { memo, useEffect, useMemo } from 'react';
import type { Material } from 'three';
import { boxWithUv } from '@/features/textures/lib/uvGeometry';
import { openingHole, wallPieces } from '../../lib/walls';
import type { Opening } from '../../types';
import type { WallLook } from './useWallLook';

interface WallPiecesProps {
  uMin: number;
  uMax: number;
  height: number;
  thickness: number;
  openings: Opening[];
  look: WallLook;
}

const EPS = 1e-6;

/** Материалы граней бокса (+X, −X, +Y, −Y, +Z, −Z): верх в разрезе — только у кусков до верха стены. */
function boxMaterials(look: WallLook, reachesTop: boolean): Material[] {
  return [look.face, look.face, reachesTop ? look.top : look.face, look.face, look.face, look.face];
}

export const WallPieces: React.FC<WallPiecesProps> = memo(({ uMin, uMax, height, thickness, openings, look }) => {
  const parts = useMemo(() => {
    const pieces = wallPieces(uMin, uMax, height, openings.map(openingHole));
    return pieces.map((p) => {
      const center: [number, number, number] = [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, 0];
      const geometry = boxWithUv([p.u1 - p.u0, p.v1 - p.v0, thickness], center, look.faceTile, look.topTile);
      return { geometry, center, materials: boxMaterials(look, Math.abs(p.v1 - height) < EPS), key: `${p.u0.toFixed(4)}_${p.v0.toFixed(4)}` };
    });
  }, [uMin, uMax, height, thickness, openings, look]);

  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} geometry={p.geometry} material={p.materials} position={p.center} castShadow receiveShadow />
      ))}
    </>
  );
});
