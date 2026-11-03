/**
 * Тело стены из прямоугольных кусков вокруг проёмов.
 * Лицевые грани и откосы — материал отделки, верх стены — материал конструкции (разрез);
 * UV в метрах — текстура непрерывна на всех кусках.
 * @module editor-3d/ui/scene/WallPieces
 */

import React, { memo, useEffect, useMemo } from 'react';
import type { BufferGeometry, Material } from 'three';
import { boxWithUv, roundedEndBox } from '@/features/textures/lib/uvGeometry';
import { openingHole, wallPieces, type WallPiece } from '../../lib/walls';
import type { Opening } from '../../types';
import type { WallLook } from './useWallLook';

interface WallPiecesProps {
  uMin: number;
  uMax: number;
  height: number;
  thickness: number;
  openings: Opening[];
  look: WallLook;
  /** Радиус скругления торцов (перегородки) */
  cornerRadius?: number;
}

const EPS = 1e-6;

/**
 * Материалы граней куска: у бокса группы +X, −X, +Y, −Y, +Z, −Z; у выдавленной формы — торцы
 * (верх и низ) и боковины. Верх в разрезе есть только у кусков, доходящих до верха стены.
 */
function pieceMaterials(geometry: BufferGeometry, look: WallLook, reachesTop: boolean): Material[] {
  const top = reachesTop ? look.top : look.face;
  if (geometry.groups.length === 6) return [look.face, look.face, top, look.face, look.face, look.face];
  return [top, look.face];
}

function pieceGeometry(p: WallPiece, props: Omit<WallPiecesProps, 'openings'>): { geometry: BufferGeometry; center: [number, number, number] } {
  const { uMin, uMax, thickness, look, cornerRadius = 0 } = props;
  const size: [number, number, number] = [p.u1 - p.u0, p.v1 - p.v0, thickness];
  const center: [number, number, number] = [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, 0];
  const ends = { start: Math.abs(p.u0 - uMin) < EPS, end: Math.abs(p.u1 - uMax) < EPS };
  const geometry =
    cornerRadius > 0
      ? roundedEndBox(size, cornerRadius, ends, center, look.faceTile, look.topTile)
      : boxWithUv(size, center, look.faceTile, look.topTile);
  return { geometry, center };
}

export const WallPieces: React.FC<WallPiecesProps> = memo(({ openings, ...props }) => {
  const { uMin, uMax, height, thickness, look, cornerRadius } = props;
  const parts = useMemo(() => {
    const pieces = wallPieces(uMin, uMax, height, openings.map(openingHole));
    return pieces.map((p) => {
      const { geometry, center } = pieceGeometry(p, { uMin, uMax, height, thickness, look, cornerRadius });
      const materials = pieceMaterials(geometry, look, Math.abs(p.v1 - height) < EPS);
      return { geometry, center, materials, key: `${p.u0.toFixed(4)}_${p.v0.toFixed(4)}` };
    });
  }, [uMin, uMax, height, thickness, openings, look, cornerRadius]);

  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} geometry={p.geometry} material={p.materials} position={p.center} castShadow receiveShadow />
      ))}
    </>
  );
});
