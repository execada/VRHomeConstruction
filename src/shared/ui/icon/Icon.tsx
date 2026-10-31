/**
 * Иконка (SVG, цвет — currentColor). Декоративная по умолчанию (aria-hidden);
 * для иконок без подписи передайте title.
 * @module shared/ui/icon/Icon
 */

import React, { memo } from 'react';
import { ICON_PATHS, type IconName } from './paths';

interface IconProps {
  name: IconName;
  size?: number;
  /** Заливка (для «звезды» избранного) */
  filled?: boolean;
  strokeWidth?: number;
  title?: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = memo(({ name, size = 20, filled = false, strokeWidth = 1.8, title, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}
    {ICON_PATHS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
));

export type { IconName };
