/**
 * Кнопка 3D-меню VR: подпись рисуется на canvas (без загрузки шрифтов из сети),
 * нажатие — лучом контроллера или пальцем (hand tracking).
 * @module vr/ui/VrButton
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

interface VrButtonProps {
  label: string;
  position: [number, number, number];
  width?: number;
  height?: number;
  /** Акцентная кнопка */
  accent?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const PX_PER_METER = 3200;

/** Текстура с подписью кнопки. */
function useLabelTexture(label: string, width: number, height: number, accent: boolean): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PX_PER_METER);
    canvas.height = Math.round(height * PX_PER_METER);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const r = canvas.height * 0.3;
      ctx.fillStyle = accent ? '#b8543b' : '#1a1815';
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, r);
      ctx.fill();
      ctx.fillStyle = '#f7f3ea';
      ctx.font = `600 ${Math.round(canvas.height * 0.42)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width * 0.9);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [label, width, height, accent]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export const VrButton: React.FC<VrButtonProps> = memo(
  ({ label, position, width = 0.13, height = 0.036, accent = false, disabled = false, onSelect }) => {
    const texture = useLabelTexture(label, width, height, accent);
    const [hover, setHover] = useState(false);
    return (
      <mesh
        position={position}
        scale={hover && !disabled ? 1.06 : 1}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onSelect();
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent opacity={disabled ? 0.4 : 1} toneMapped={false} />
      </mesh>
    );
  },
);
