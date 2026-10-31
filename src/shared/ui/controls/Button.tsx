/**
 * Кнопки: текстовая (основная/вторичная/прозрачная/опасная) и кнопка-иконка.
 * @module shared/ui/controls/Button
 */

import React, { forwardRef } from 'react';
import cn from 'classnames';
import { Icon, type IconName } from '../icon/Icon';
import styles from './controls.module.scss';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(styles.button, styles[variant], size === 'sm' && styles.small, block && styles.block, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  ),
);

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Подпись для экранных дикторов и подсказки */
  label: string;
  active?: boolean;
  size?: 'md' | 'sm';
  filled?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, active, size = 'md', filled, className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(styles.iconButton, active && styles.iconButtonActive, size === 'sm' && styles.iconButtonSmall, className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} filled={filled} />
    </button>
  ),
);
