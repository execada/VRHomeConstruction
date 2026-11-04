/**
 * Мини-план документа сцены (SVG): контур комнаты, проёмы, перегородки, мебель.
 * Всегда соответствует реальному содержимому шаблона.
 * @module templates/ui/ScenePlanPreview
 */

import React, { memo } from 'react';
import { furnitureFootprint, isFlatItem, partitionFootprint } from '@/features/editor-3d/lib/placement';
import { isWallSide, outerBounds, wallFrame } from '@/features/editor-3d/lib/walls';
import type { SceneDocument } from '@/features/editor-3d/lib/scene/schema';
import type { FurnitureItem } from '@/features/furniture/types';
import { add2, obbCorners, scale2 } from '@/shared/lib/math/geometry2d';

const points = (corners: ReadonlyArray<readonly [number, number]>) => corners.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join(' ');

export const ScenePlanPreview: React.FC<{ doc: SceneDocument; className?: string }> = memo(({ doc, className }) => {
  const { width, depth } = doc.dimensions;
  const outer = outerBounds(doc.dimensions, doc.outerWalls);
  const pad = 0.4;
  return (
    <svg
      viewBox={`${outer.minX - pad} ${outer.minZ - pad} ${outer.maxX - outer.minX + 2 * pad} ${outer.maxZ - outer.minZ + 2 * pad}`}
      className={className}
      role="img"
      aria-label="План шаблона"
    >
      <rect x={outer.minX} y={outer.minZ} width={outer.maxX - outer.minX} height={outer.maxZ - outer.minZ} fill="var(--text-2)" rx={0.04} />
      <rect x={-width / 2} y={-depth / 2} width={width} height={depth} fill={doc.finishes.floor.textureId ? '#d8b98f' : doc.finishes.floor.color} />
      {doc.openings
        .filter((o) => isWallSide(o.wallId))
        .map((o) => {
          const frame = wallFrame(o.wallId as never, doc.dimensions);
          const t = doc.outerWalls[o.wallId as keyof typeof doc.outerWalls].thickness;
          const center = add2(add2(frame.origin, scale2(frame.tangent, o.position[0])), scale2(frame.normal, -t / 2));
          const corners = obbCorners({ center, half: [o.width / 2, t / 2 + 0.01], angle: frame.rotationY });
          return <polygon key={o.id} points={points(corners)} fill={o.type === 'window' ? '#a9c8e8' : 'var(--card)'} />;
        })}
      {doc.partitions.map((p) => (
        <polygon key={p.id} points={points(obbCorners(partitionFootprint(p)))} fill="var(--text-2)" />
      ))}
      {(doc.furniture as FurnitureItem[]).map((f) => (
        <polygon
          key={f.id}
          points={points(obbCorners(furnitureFootprint(f)))}
          fill={isFlatItem(f) ? 'rgb(138 154 107 / 35%)' : 'rgb(184 84 59 / 55%)'}
          stroke="var(--card)"
          strokeWidth={0.02}
        />
      ))}
    </svg>
  );
});
