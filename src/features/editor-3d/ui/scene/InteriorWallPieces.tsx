/**
 * Тело внутренней стены с учётом стыков: участки стены (контуры с торцами «на ус»,
 * по грани соседней стены, скруглённые) режутся на куски вокруг проёмов и выдавливаются
 * в призмы. Лицевые грани — отделка, верх — материал конструкции.
 * @module editor-3d/ui/scene/InteriorWallPieces
 */

import React, { memo, useEffect, useMemo } from 'react';
import { clipPolygonToRect, polygonArea } from '@/shared/lib/math/polygon';
import { prismWithUv } from '@/features/textures/lib/uvGeometry';
import type { WallSpan } from '../../lib/wallJoints';
import { openingHole, wallPieces } from '../../lib/walls';
import type { Opening } from '../../types';
import type { WallLook } from './useWallLook';

interface InteriorWallPiecesProps {
  /** Участки стены в её локальных координатах (u, d) */
  spans: WallSpan[];
  length: number;
  height: number;
  openings: Opening[];
  look: WallLook;
}

const EPS = 1e-6;
const FAR = 1e3;

export const InteriorWallPieces: React.FC<InteriorWallPiecesProps> = memo(({ spans, length, height, openings, look }) => {
  const parts = useMemo(() => {
    const pieces = wallPieces(-length / 2 - FAR, length / 2 + FAR, height, openings.map(openingHole));
    return spans.flatMap((span, s) =>
      pieces.flatMap((p) => {
        const outline = clipPolygonToRect(span.polygon, { minX: p.u0, maxX: p.u1, minZ: -FAR, maxZ: FAR });
        if (outline.length < 3 || polygonArea(outline) < EPS) return [];
        const geometry = prismWithUv(outline, p.v0, p.v1, look.faceTile, look.topTile);
        const materials = [look.face, Math.abs(p.v1 - height) < EPS ? look.top : look.face];
        return [{ geometry, materials, key: `${s}_${p.u0.toFixed(4)}_${p.v0.toFixed(4)}` }];
      }),
    );
  }, [spans, length, height, openings, look]);

  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} geometry={p.geometry} material={p.materials} castShadow receiveShadow />
      ))}
    </>
  );
});
