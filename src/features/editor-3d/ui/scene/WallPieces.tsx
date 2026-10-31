/**
 * Тело стены из прямоугольных кусков вокруг проёмов.
 * Все куски одной стены делят один материал; UV в метрах — текстура непрерывна.
 * @module editor-3d/ui/scene/WallPieces
 */

import React, { memo, useEffect, useMemo } from 'react';
import type { Material } from 'three';
import { boxWithUv, roundedEndBox } from '@/features/textures/lib/uvGeometry';
import { openingHole, wallPieces } from '../../lib/walls';
import type { Opening } from '../../types';

interface WallPiecesProps {
  uMin: number;
  uMax: number;
  height: number;
  thickness: number;
  openings: Opening[];
  material: Material;
  /** Размер тайла текстуры, м */
  tile: number;
  /** Радиус скругления торцов (перегородки) */
  cornerRadius?: number;
}

const EPS = 1e-6;

export const WallPieces: React.FC<WallPiecesProps> = memo(
  ({ uMin, uMax, height, thickness, openings, material, tile, cornerRadius = 0 }) => {
    const parts = useMemo(() => {
      const pieces = wallPieces(uMin, uMax, height, openings.map(openingHole));
      return pieces.map((p) => {
        const size: [number, number, number] = [p.u1 - p.u0, p.v1 - p.v0, thickness];
        const center: [number, number, number] = [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, 0];
        const ends = { start: Math.abs(p.u0 - uMin) < EPS, end: Math.abs(p.u1 - uMax) < EPS };
        const geometry =
          cornerRadius > 0 ? roundedEndBox(size, cornerRadius, ends, center, tile) : boxWithUv(size, center, tile);
        return { geometry, center, key: `${p.u0.toFixed(4)}_${p.v0.toFixed(4)}` };
      });
    }, [uMin, uMax, height, thickness, openings, tile, cornerRadius]);

    useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

    return (
      <>
        {parts.map((p) => (
          <mesh key={p.key} geometry={p.geometry} material={material} position={p.center} castShadow receiveShadow />
        ))}
      </>
    );
  },
);
