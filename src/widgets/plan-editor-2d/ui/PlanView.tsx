/**
 * План сверху: пол (с текстурой), сетка, стены, проёмы, перегородки, мебель, размеры.
 * Колесо — масштаб, перетаскивание фона — панорама, клик по полу — отделка пола.
 * @module widgets/plan-editor-2d/ui/PlanView
 */

import React, { useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { resolveTexture } from '@/features/textures/lib/catalog';
import { textureThumbnail } from '@/features/textures/lib/textureCache';
import { selectTextureCatalog } from '@/features/textures/model/selectors';
import { fitViewBox } from '../lib/plan';
import { useSvgViewport } from '../model/useSvgInteraction';
import { PlanFurniture } from './PlanFurniture';
import { PlanPartitions } from './PlanPartitions';
import { PlanWalls } from './PlanWalls';
import styles from './PlanEditor2D.module.scss';

const MARGIN = 1.2;

const FloorFill: React.FC<{ width: number; depth: number }> = ({ width, depth }) => {
  const commands = useSceneCommands();
  const finish = useSelector(editorSelectors.selectFinishes).floor;
  const catalog = useSelector(selectTextureCatalog);
  const def = resolveTexture(catalog, finish.textureId, 'floor');
  const thumb = def ? textureThumbnail(def) : null;
  const tile = (def?.tileMeters ?? 1) * finish.scale;
  return (
    <>
      {thumb && (
        <defs>
          <pattern id="plan-floor" patternUnits="userSpaceOnUse" width={tile} height={tile}>
            <image href={thumb} width={tile} height={tile} preserveAspectRatio="none" />
          </pattern>
        </defs>
      )}
      <rect
        x={-width / 2}
        y={-depth / 2}
        width={width}
        height={depth}
        fill={thumb ? 'url(#plan-floor)' : finish.color}
        className={styles.floor}
        onPointerDown={(e) => {
          e.stopPropagation();
          commands.select({ kind: 'floor' });
        }}
      />
    </>
  );
};

const Dimensions: React.FC<{ width: number; depth: number; thickness: number }> = ({ width, depth, thickness }) => (
  <>
    <text x={0} y={-depth / 2 - thickness - 0.25} fontSize={0.2} className={styles.dimension}>
      {width.toFixed(2)} м
    </text>
    <text x={-width / 2 - thickness - 0.3} y={0} fontSize={0.2} className={styles.dimension} transform={`rotate(-90 ${-width / 2 - thickness - 0.3} 0)`}>
      {depth.toFixed(2)} м
    </text>
  </>
);

export const PlanView: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const thickness = useSelector(editorSelectors.selectWallThickness);
  const svg = useRef<SVGSVGElement>(null);
  const fitNow = () =>
    fitViewBox({ minX: -dims.width / 2, maxX: dims.width / 2, minZ: -dims.depth / 2, maxZ: dims.depth / 2 }, MARGIN + thickness);
  // Начальная рамка вида; дальше при перетаскивании стены вид сдвигается вместе с комнатой (см. PlanWalls),
  // а двойной клик вписывает комнату заново.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialFit = useMemo(fitNow, []);
  const viewport = useSvgViewport(svg, initialFit);

  return (
    <svg
      ref={svg}
      className={styles.svg}
      viewBox={viewport.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label="План комнаты"
      {...viewport.panHandlers}
      onDoubleClick={() => viewport.reset(fitNow())}
    >
      <FloorFill width={dims.width} depth={dims.depth} />
      <PlanWalls svg={svg} shiftView={viewport.shift} />
      <PlanPartitions svg={svg} />
      <PlanFurniture svg={svg} />
      <Dimensions width={dims.width} depth={dims.depth} thickness={thickness} />
    </svg>
  );
};
