/**
 * Обучающее окно при первом входе в редактор (показывается один раз).
 * @module editor-3d/ui/EditorOnboarding
 */

import React, { useState } from 'react';
import styles from './EditorOnboarding.module.scss';

const LS_KEY = 'vrhc:onboarded:v2';

const STEPS: { icon: string; title: string; text: string }[] = [
  { icon: '🛋️', title: 'Мебель', text: 'Слева «Мебель» → выберите модель → кликните по полу (или перетащите карточку в сцену). Предмет сразу встанет на пол и прижмётся к стене.' },
  { icon: '✋', title: 'Расстановка', text: 'Перетаскивайте предметы мышью, кольцо под предметом — поворот. R — 90°, стрелки — точный сдвиг, Del — удалить.' },
  { icon: '🧱', title: 'Комната', text: 'Клик по стене, полу или потолку — их отделка и размеры справа. Вкладка «Комната» — перегородки, окна и двери.' },
  { icon: '🗺️', title: '2D и камеры', text: '2D — план и развёртка стены с редактированием. В 3D: облёт, вид от первого лица, план сверху и фиксированные виды.' },
  { icon: '☀️', title: 'Свет', text: 'Вкладка «Свет»: светильники, солнце за окнами (время суток, сторона) и пейзаж за окном.' },
  { icon: '🥽', title: 'VR', text: 'Кнопка VR — для Meta Quest 3/3+ (браузер шлема) и PC VR. Всё сохраняется автоматически.' },
];

export const EditorOnboarding: React.FC = () => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) !== '1';
    } catch {
      return true;
    }
  });

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(LS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2>Добро пожаловать в редактор 🏠</h2>
          <p>Несколько подсказок, чтобы начать за пару минут.</p>
        </div>
        <ul className={styles.steps}>
          {STEPS.map((s) => (
            <li key={s.title}>
              <span className={styles.icon}>{s.icon}</span>
              <span>
                <strong>{s.title}.</strong> {s.text}
              </span>
            </li>
          ))}
        </ul>
        <button className={styles.start} onClick={close}>
          Начать
        </button>
      </div>
    </div>
  );
};
