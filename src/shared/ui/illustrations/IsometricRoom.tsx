/**
 * Изометрическая иллюстрация комнаты (векторная): пустая — пол, стены, окно и солнечное пятно;
 * обставленная — плюс ТВ-зона, диван, столик с вазой, ковёр и торшер.
 * @module shared/ui/illustrations/IsometricRoom
 */

import React, { memo } from 'react';

type Vec3 = [number, number, number];

const SCALE = 26;
const COS30 = Math.cos(Math.PI / 6);
const ORIGIN: [number, number] = [160, 118];

/** Проекция точки комнаты (x вправо-вниз, z влево-вниз, y вверх) на плоскость рисунка. */
function project([x, y, z]: Vec3): [number, number] {
  return [ORIGIN[0] + (x - z) * COS30 * SCALE, ORIGIN[1] + (x + z) * 0.5 * SCALE - y * SCALE];
}

const poly = (points: Vec3[]) =>
  points
    .map(project)
    .map(([sx, sy]) => `${sx.toFixed(1)},${sy.toFixed(1)}`)
    .join(' ');

/** Доска паркета: линия по полу от стены к краю. */
const Board: React.FC<{ x: number }> = ({ x }) => {
  const [x1, y1] = project([x, 0, 0]);
  const [x2, y2] = project([x, 0, 5.5]);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b88a52" strokeWidth={0.8} />;
};

/** Видимые грани бокса: верх, левая и правая. */
const Box: React.FC<{ at: Vec3; size: Vec3; colors: [string, string, string] }> = ({ at, size, colors }) => {
  const [x, y, z] = at;
  const [w, h, d] = size;
  return (
    <g>
      <polygon points={poly([[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]])} fill={colors[0]} />
      <polygon points={poly([[x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]])} fill={colors[1]} />
      <polygon points={poly([[x + w, y, z], [x + w, y, z + d], [x + w, y + h, z + d], [x + w, y + h, z]])} fill={colors[2]} />
    </g>
  );
};

/** Гостиная: ТВ-зона у левой стены, диван спинкой к зрителю, столик с вазой, торшер в углу. Порядок — от дальних к ближним. */
const Furniture: React.FC = () => (
  <g>
    <Box at={[1.3, 0, 1.7]} size={[2.2, 0.03, 2.5]} colors={['#8f7d6a', '#7d6c5b', '#6f604f']} />
    <Box at={[0.45, 0, 0.45]} size={[0.12, 1.9, 0.12]} colors={['#2b2b2b', '#222', '#1b1b1b']} />
    <Box at={[0.3, 1.9, 0.3]} size={[0.42, 0.4, 0.42]} colors={['#fff4d8', '#f2e2b8', '#e8d39f']} />
    <Box at={[0.15, 0, 1.4]} size={[0.5, 0.5, 3]} colors={['#4a3f35', '#3a3129', '#322a23']} />
    <Box at={[0.18, 0.95, 1.9]} size={[0.08, 1.15, 2]} colors={['#26282d', '#1b1d21', '#14161a']} />
    <Box at={[1.7, 0, 2.4]} size={[0.8, 0.4, 1]} colors={['#efe9df', '#d6cfc3', '#c4bcae']} />
    <Box at={[1.95, 0.4, 2.75]} size={[0.22, 0.22, 0.22]} colors={['#d0634a', '#b04e37', '#9a432f']} />
    <Box at={[3, 0, 1.4]} size={[1, 0.45, 3]} colors={['#e9e5de', '#d3cdc3', '#c2bbaf']} />
    <Box at={[3, 0.45, 1.4]} size={[0.7, 0.3, 0.25]} colors={['#e3ded6', '#cdc6bb', '#bab2a5']} />
    <Box at={[3, 0.45, 4.15]} size={[0.7, 0.3, 0.25]} colors={['#e3ded6', '#cdc6bb', '#bab2a5']} />
    <Box at={[3.7, 0.45, 1.4]} size={[0.3, 0.7, 3]} colors={['#e6e1da', '#d0c9bf', '#beb7aa']} />
  </g>
);

export const IsometricRoom: React.FC<{ furnished?: boolean; className?: string }> = memo(({ furnished = false, className }) => (
  <svg viewBox="0 0 320 236" className={className} role="img" aria-label={furnished ? 'Обставленная комната' : 'Пустая комната'}>
    <polygon points={poly([[0, 0, 0], [5.5, 0, 0], [5.5, 0, 5.5], [0, 0, 5.5]])} fill="#c99b62" />
    {Array.from({ length: 9 }, (_, i) => (
      <Board key={i} x={0.55 * (i + 1)} />
    ))}
    <polygon points={poly([[0, 0, 0], [0, 4, 0], [0, 4, 5.5], [0, 0, 5.5]])} fill="#e9e7e4" />
    <polygon points={poly([[0, 0, 0], [5.5, 0, 0], [5.5, 4, 0], [0, 4, 0]])} fill="#f5f4f2" />
    <polygon points={poly([[2.2, 1.3, 0], [4.2, 1.3, 0], [4.2, 3.3, 0], [2.2, 3.3, 0]])} fill="#ffe7b5" />
    <polyline points={poly([[3.2, 1.3, 0], [3.2, 3.3, 0]])} stroke="#e3e1dd" strokeWidth={2} fill="none" />
    <polyline points={poly([[2.2, 2.3, 0], [4.2, 2.3, 0]])} stroke="#e3e1dd" strokeWidth={2} fill="none" />
    <polygon points={poly([[2.4, 0, 1.6], [4.2, 0, 1.6], [4.6, 0, 3.4], [2.8, 0, 3.4]])} fill="#f3c27a" opacity={0.65} />
    {furnished && <Furniture />}
  </svg>
));
