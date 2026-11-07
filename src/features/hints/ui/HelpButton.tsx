/**
 * Кнопка «?» в верхней панели редактора: переключатель подсказок, обучение заново и показ
 * закрытых подсказок. Закрывается кликом вне окна и клавишей Esc.
 * @module hints/ui/HelpButton
 */

import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, IconButton, Toggle } from '@/shared/ui/controls';
import { actions } from '../slice';
import { selectors } from '../selectors';
import styles from './hints.module.scss';

export const HelpButton: React.FC = () => {
  const dispatch = useDispatch();
  const enabled = useSelector(selectors.selectHintsEnabled);
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
    <div className={styles.helpWrap} ref={ref}>
      <IconButton icon="help" label="Помощь и подсказки" data-hint="help" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className={styles.helpPopover} role="dialog" aria-label="Помощь">
          <span className={styles.helpTitle}>Помощь</span>
          <Toggle label="Показывать подсказки" checked={enabled} onChange={(on) => dispatch(actions.setEnabled(on))} />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setOpen(false);
              dispatch(actions.startTour());
            }}
          >
            Пройти обучение
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dispatch(actions.resetHints())}>
            Показать подсказки заново
          </Button>
        </div>
      )}
    </div>
  );
};
