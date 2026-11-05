/**
 * Отражения и рассеянный свет интерьера: виртуальная «комната» (тёплые стены, тёмный пол,
 * светлый потолок) с ярким окном со стороны солнца. Глянцевые поверхности (лакированный паркет,
 * плитка, стекло) отражают комнату, а не уличное небо — иначе пол выглядит «мокрым»,
 * а потолок окрашивается в цвет травы.
 * @module editor-3d/ui/scene/InteriorEnvironment
 */

import React, { memo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { BackSide } from 'three';

/**
 * Параметры сцены, которые drei применяет из <Environment>. Фон рисует отдельная сфера
 * (site/PanoramaBackdrop), поэтому параметры фона здесь нейтральные.
 */
export interface EnvSceneProps {
  backgroundIntensity: number;
  backgroundRotation: [number, number, number];
  environmentIntensity: number;
  environmentRotation: [number, number, number];
}

interface InteriorEnvironmentProps {
  /** Горизонтальное направление на окно/солнце [x, z] (единичный вектор) */
  windowDir: [number, number];
  /** Дневной свет 0..1 (ночью окно тёмное) */
  daylight: number;
  sceneProps: EnvSceneProps;
}

const WALL_TONE = '#d6cec2';
const FLOOR_TONE = '#5b4838';
const WINDOW_DISTANCE = 9;

export const InteriorEnvironment: React.FC<InteriorEnvironmentProps> = memo(({ windowDir, daylight, sceneProps }) => (
  <Environment resolution={128} frames={1} {...sceneProps}>
    <mesh scale={30}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial color={WALL_TONE} side={BackSide} />
    </mesh>
    <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[30, 32]} />
      <meshBasicMaterial color={FLOOR_TONE} />
    </mesh>
    <Lightformer form="rect" intensity={1.1} color="#fff2df" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[7, 7, 1]} />
    <Lightformer
      form="rect"
      intensity={0.2 + 3.2 * daylight}
      color="#f2f5ff"
      position={[windowDir[0] * WINDOW_DISTANCE, 1.4, windowDir[1] * WINDOW_DISTANCE]}
      scale={[7, 3.6, 1]}
    />
  </Environment>
));
