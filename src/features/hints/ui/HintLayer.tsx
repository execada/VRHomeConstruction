/**
 * Подсказки в редакторе: одна за раз у нужного элемента — «здесь выберите модели», после первого
 * предмета — «сюда — дизайн» и дальше по порядку. «Понятно» закрывает подсказку, «Выключить
 * подсказки» — все (включаются снова кнопкой «?» вверху или в настройках).
 * @module hints/ui/HintLayer
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { Button } from '@/shared/ui/controls';
import { currentHint, type HintDefinition } from '../lib/hintCatalog';
import { actions } from '../slice';
import { selectors } from '../selectors';
import { Callout } from './Callout';
import { rectOf, useTargetRect, useTicker } from './useTargetRect';
import styles from './hints.module.scss';

/** Как часто подсказки проверяют, появились ли их элементы на экране, мс. */
const CHECK_MS = 500;

const HintBubble: React.FC<{ hint: HintDefinition }> = ({ hint }) => {
  const dispatch = useDispatch();
  const rect = useTargetRect(hint.target);
  if (!rect) return null;
  return (
    <Callout target={rect} placement={hint.placement} title={hint.title} text={hint.text} label={`Подсказка: ${hint.title}`}>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" onClick={() => dispatch(actions.dismiss(hint.id))}>
          Понятно
        </Button>
        <button type="button" className={styles.link} onClick={() => dispatch(actions.setEnabled(false))}>
          Выключить подсказки
        </button>
      </div>
    </Callout>
  );
};

export const HintLayer: React.FC = () => {
  const enabled = useSelector(selectors.selectHintsEnabled);
  const dismissed = useSelector(selectors.selectDismissedHints);
  const touring = useSelector(selectors.selectTourStep) !== null;
  const furniture = useSelector(furnitureSelectors.selectFurnitureItems).length;
  const selected = useSelector(selectionSelectors.selectSelection) !== null;
  const viewMode = useSelector(editorSelectors.selectViewMode) === '2d' ? '2d' : '3d';
  const active = enabled && !touring;
  useTicker(CHECK_MS, active);
  if (!active) return null;
  const hint = currentHint({ furniture, selected, viewMode }, dismissed, (target) => rectOf(target) !== null);
  return hint ? <HintBubble key={hint.id} hint={hint} /> : null;
};
