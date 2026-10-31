/**
 * Аватар пользователя: инициалы на цветном фоне (цвет стабилен для имени).
 * @module shared/ui/avatar/Avatar
 */

import React from 'react';
import cn from 'classnames';
import { avatarColor, initialsOf } from '@/shared/lib/avatar';
import styles from './avatar.module.scss';

interface AvatarProps {
  name?: string;
  size?: number;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 36, className }) => {
  const initials = initialsOf(name);
  return (
    <span
      className={cn(styles.avatar, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: initials ? avatarColor(name) : undefined }}
      aria-hidden="true"
    >
      {initials || (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      )}
    </span>
  );
};
