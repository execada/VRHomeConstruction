/**
 * Модальный диалог (портал в body): закрывается по Esc и клику по фону,
 * фокус переводится внутрь диалога и возвращается после закрытия.
 * Плюс готовый диалог подтверждения.
 * @module shared/ui/overlay/Dialog
 */

import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import cn from 'classnames';
import { Button, IconButton } from '../controls';
import styles from './overlay.module.scss';
import { useModalBehavior } from './useModalBehavior';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
  /** Дополнительный класс окна (например, своя ширина) */
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({ title, onClose, children, actions, wide, className }) => {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useModalBehavior(ref, onClose);

  return createPortal(
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cn(styles.dialog, wide && styles.dialogWide, className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {title}
          </h2>
          <IconButton icon="close" label="Закрыть" onClick={onClose} />
        </header>
        {children}
        {actions && <footer className={styles.dialogActions}>{actions}</footer>}
      </div>
    </div>,
    document.body,
  );
};

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel, danger, onConfirm, onCancel }) => (
  <Dialog
    title={title}
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onCancel}>Отмена</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p className={styles.dialogText}>{message}</p>
  </Dialog>
);
