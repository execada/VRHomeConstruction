/**
 * Выдвижная панель (портал в body): закрывается по Esc и клику по фону,
 * фокус переводится внутрь и возвращается после закрытия.
 * @module shared/ui/overlay/Drawer
 */

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import cn from 'classnames';
import { IconButton } from '../controls';
import styles from './overlay.module.scss';
import { useModalBehavior } from './useModalBehavior';

interface DrawerProps {
  /** Подпись для экранных дикторов */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
}

export const Drawer: React.FC<DrawerProps> = ({ label, onClose, children, side = 'right' }) => {
  const ref = useRef<HTMLElement>(null);

  useModalBehavior(ref, onClose);

  return createPortal(
    <div className={styles.drawerBackdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className={cn(styles.drawer, side === 'left' && styles.drawerLeft)} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <IconButton icon="close" label="Закрыть" className={styles.drawerClose} onClick={onClose} />
        {children}
      </aside>
    </div>,
    document.body,
  );
};
