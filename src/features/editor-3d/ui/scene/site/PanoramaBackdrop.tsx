/**
 * Фото-фон: сфера с панорамой, которая всегда стоит вокруг камеры (бесконечно далеко),
 * рисуется первой и не пишет глубину. Снимок выводится как есть, без тонмаппинга,
 * а яркость (ночь, экспозиция) — множителем цвета. Ничего не ловит указателем.
 * @module editor-3d/ui/scene/site/PanoramaBackdrop
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, Texture } from 'three';
import { backdropSphere } from '../../../lib/siteGeometry';
import { NO_RAYCAST } from '../pointer';

/** Радиус сферы — доля дальней плоскости камеры (в плане сверху она короче). */
const RADIUS_SHARE = 0.9;

interface PanoramaBackdropProps {
  texture: Texture;
  /** Множитель яркости снимка */
  intensity: number;
  /** Поворот панорамы вокруг вертикали, рад */
  rotation: number;
}

export const PanoramaBackdrop: React.FC<PanoramaBackdropProps> = memo(({ texture, intensity, rotation }) => {
  const ref = useRef<Mesh>(null);
  const geometry = useMemo(() => backdropSphere(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.position.copy(camera.position);
    mesh.scale.setScalar(camera.far * RADIUS_SHARE);
  });

  return (
    <mesh ref={ref} geometry={geometry} rotation={[0, rotation, 0]} renderOrder={-1000} frustumCulled={false} raycast={NO_RAYCAST}>
      <meshBasicMaterial map={texture} color={[intensity, intensity, intensity]} depthWrite={false} depthTest={false} fog={false} toneMapped={false} />
    </mesh>
  );
});
