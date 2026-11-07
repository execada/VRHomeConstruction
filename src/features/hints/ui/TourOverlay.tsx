/**
 * Обучение по редактору: экран затемнён, элемент шага подсвечен «окошком», рядом карточка с
 * объяснением и кнопками «Назад» / «Далее» / «Готово». Стрелки ← → листают, Esc закрывает;
 * пока идёт обучение, клавиши и клики не попадают в сцену.
 * @module hints/ui/TourOverlay
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, IconButton } from '@/shared/ui/controls';
import { TOUR_STEPS } from '../lib/hintCatalog';
import { actions } from '../slice';
import { selectors } from '../selectors';
import { Callout } from './Callout';
import { useTargetRect } from './useTargetRect';
import styles from './hints.module.scss';

/** Запас «окошка» вокруг элемента, px. */
const PAD = 6;

const Tour: React.FC<{ step: number }> = ({ step }) => {
  const dispatch = useDispatch();
  const index = Math.min(step, TOUR_STEPS.length - 1);
  const current = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  const rect = useTargetRect(current.target);
  const spot = rect && { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  useEffect(() => {
    const finish = () => dispatch(actions.finishTour());
    const go = (to: number) => dispatch(actions.setTourStep(to));
    // Ловим клавиши раньше редактора (фаза перехвата): стрелки не двигают выделенную мебель.
    const onKey = (e: KeyboardEvent) => {
      const handled = e.key === 'Escape' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter';
      if (!handled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowLeft') go(Math.max(0, index - 1));
      else if (last) finish();
      else go(index + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dispatch, index, last]);

  return (
    <>
      {createPortal(
        <>
          {spot ? <div className={styles.spotlight} style={spot} /> : <div className={styles.backdrop} />}
          <div className={styles.shield} aria-hidden />
        </>,
        document.body,
      )}
      <Callout target={spot} placement={current.placement} title={current.title} text={current.text} label={`Обучение: ${current.title}`} className={styles.tourCard}>
        <IconButton icon="close" label="Закрыть обучение" size="sm" className={styles.close} onClick={() => dispatch(actions.finishTour())} />
        <div className={styles.actions}>
          <Button size="sm" disabled={index === 0} onClick={() => dispatch(actions.setTourStep(index - 1))}>
            Назад
          </Button>
          <Button size="sm" variant="primary" onClick={() => dispatch(last ? actions.finishTour() : actions.setTourStep(index + 1))}>
            {last ? 'Готово' : 'Далее'}
          </Button>
          <span className={styles.counter}>
            {index + 1} / {TOUR_STEPS.length}
          </span>
        </div>
      </Callout>
    </>
  );
};

export const TourOverlay: React.FC = () => {
  const step = useSelector(selectors.selectTourStep);
  return step === null ? null : <Tour step={step} />;
};
