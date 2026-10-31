/**
 * Выпадающее меню: открывается кнопкой, закрывается кликом вне меню и клавишей Esc.
 * @module shared/ui/overlay/Menu
 */

import React, { useEffect, useRef, useState } from 'react';
import cn from 'classnames';
import { Icon, type IconName } from '../icon/Icon';
import styles from './overlay.module.scss';

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Разделитель перед пунктом */
  separated?: boolean;
}

interface MenuProps {
  /** Кнопка-триггер; получает обработчик и состояние */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}

export const Menu: React.FC<MenuProps> = ({ trigger, items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div className={cn(styles.menu, align === 'right' ? styles.alignRight : styles.alignLeft)} role="menu">
          {items.map((item) => (
            <React.Fragment key={item.label}>
              {item.separated && <div className={styles.menuSeparator} role="separator" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn(styles.menuItem, item.danger && styles.menuDanger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} size={18} />}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
