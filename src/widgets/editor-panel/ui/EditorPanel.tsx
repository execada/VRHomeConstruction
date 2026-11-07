/**
 * Левая панель редактора: вкладки каталога, комнаты, отделки, света и вида. Ширину панели
 * можно менять, потянув за правый край (запоминается в браузере); каталог раскладывает
 * карточки в столько колонок, сколько помещается.
 * @module widgets/editor-panel/ui/EditorPanel
 */

import React, { useCallback, useEffect, useState } from 'react';
import cn from 'classnames';
import { z } from 'zod';
import { useStoredState } from '@/shared/lib/useStoredState';
import { Icon, type IconName } from '@/shared/ui/icon/Icon';
import { CatalogPanel } from './CatalogPanel';
import { FinishesPanel } from './FinishesPanel';
import { LightPanel } from './LightPanel';
import { RoomPanel } from './RoomPanel';
import { ViewPanel } from './ViewPanel';
import { PanelResizer } from './PanelResizer';
import { clampPanelWidth, PANEL_WIDTH } from '../lib/panelWidth';
import styles from './EditorPanel.module.scss';

type TabId = 'catalog' | 'room' | 'finishes' | 'light' | 'view';

const TABS: Array<{ id: TabId; label: string; icon: IconName; Panel: React.FC }> = [
  { id: 'catalog', label: 'Мебель', icon: 'sofa', Panel: CatalogPanel },
  { id: 'room', label: 'Комната', icon: 'wall', Panel: RoomPanel },
  { id: 'finishes', label: 'Отделка', icon: 'texture', Panel: FinishesPanel },
  { id: 'light', label: 'Свет', icon: 'sun', Panel: LightPanel },
  { id: 'view', label: 'Вид', icon: 'camera', Panel: ViewPanel },
];

const STORED_WIDTH = z.number().finite();
const windowWidth = () => (typeof window === 'undefined' ? Infinity : window.innerWidth);

/** Ширина панели: запомненная в браузере и ограниченная окном (окно сузили — панель тоже). */
function usePanelWidth(): { width: number; setWidth: (width: number) => void; reset: () => void } {
  const [stored, store] = useStoredState('editorPanelWidth', STORED_WIDTH, PANEL_WIDTH.initial);
  const [windowSize, setWindowSize] = useState(windowWidth);
  useEffect(() => {
    const onResize = () => setWindowSize(windowWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const setWidth = useCallback((width: number) => store(clampPanelWidth(width, windowWidth())), [store]);
  const reset = useCallback(() => store(PANEL_WIDTH.initial), [store]);
  return { width: clampPanelWidth(stored, windowSize), setWidth, reset };
}

export const EditorPanel: React.FC = () => {
  const [tab, setTab] = useState<TabId>('catalog');
  const { width, setWidth, reset } = usePanelWidth();
  const Active = TABS.find((t) => t.id === tab)?.Panel ?? CatalogPanel;
  return (
    <aside className={styles.wrap} aria-label="Инструменты">
      <nav className={styles.tabs} role="tablist" aria-orientation="vertical">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={cn(styles.tab, t.id === tab && styles.tabActive)}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className={styles.content} role="tabpanel" style={{ width }}>
        <Active />
      </div>
      <PanelResizer width={width} onChange={setWidth} onReset={reset} />
    </aside>
  );
};
