/**
 * Индикатор загрузки сцены: при первом открытии — полупрозрачная заставка с процентом
 * (модели, текстуры и HDRI грузятся несколько секунд), потом — компактная плашка
 * при подгрузке новых моделей. Если загружать нечего, заставка исчезает сама.
 * @module widgets/scene-viewport/ui/SceneLoader
 */

import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useProgress } from '@react-three/drei';
import { ProjectSessionFeature } from '@/features/project-session';
import cn from 'classnames';
import styles from './SceneViewport.module.scss';

/** Сколько ждём начала загрузки, прежде чем считать сцену готовой. */
const IDLE_GRACE_MS = 1500;
/** Пауза после загрузки перед снимком превью (тени и текстуры успевают отрисоваться). */
const THUMBNAIL_DELAY_MS = 1200;

export const SceneLoader: React.FC = () => {
  const dispatch = useDispatch();
  const { active, progress } = useProgress();
  const [initialDone, setInitialDone] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (active) {
      startedRef.current = true;
      setStarted(true);
    } else if (startedRef.current) {
      setInitialDone(true);
    }
  }, [active]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!startedRef.current) setInitialDone(true);
    }, IDLE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialDone) return undefined;
    const timer = window.setTimeout(() => dispatch(ProjectSessionFeature.actions.thumbnailRequested()), THUMBNAIL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [initialDone, dispatch]);

  const percent = Math.round(progress);
  if (!initialDone) {
    return (
      <div className={styles.loader} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <span>Загружаем сцену{started ? ` · ${percent}%` : '…'}</span>
      </div>
    );
  }
  return (
    <div className={cn(styles.loadingPill, active && styles.loadingPillVisible)} role="status" aria-live="polite">
      {active && `Загрузка моделей · ${percent}%`}
    </div>
  );
};
