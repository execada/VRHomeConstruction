/**
 * Индикатор сохранения: «Сохранено», «Сохранение…», «Есть изменения», «Нет связи», «Ошибка».
 * Клик — сохранить сейчас.
 * @module widgets/editor-topbar/ui/SaveStatus
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { ProjectSessionFeature, type SaveState } from '@/features/project-session';
import styles from './EditorTopBar.module.scss';

const LABELS: Record<SaveState, string> = {
  saved: 'Сохранено',
  dirty: 'Есть изменения',
  saving: 'Сохранение…',
  offline: 'Нет связи — сохранено на устройстве',
  error: 'Ошибка сохранения',
};

export const SaveStatus: React.FC = () => {
  const dispatch = useDispatch();
  const state = useSelector(ProjectSessionFeature.selectors.selectSaveState);
  const lastSavedAt = useSelector(ProjectSessionFeature.selectors.selectLastSavedAt);
  const time = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <button
      type="button"
      className={cn(styles.status, state === 'saved' && styles.statusSaved, (state === 'error' || state === 'offline') && styles.statusError)}
      title="Сохранить сейчас (Ctrl+S)"
      onClick={() => dispatch(ProjectSessionFeature.actions.saveNowRequested())}
      aria-live="polite"
    >
      <span className={styles.dot} />
      {LABELS[state]}
      {state === 'saved' && time ? ` · ${time}` : ''}
    </button>
  );
};
