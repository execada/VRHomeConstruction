/**
 * Левая панель редактора: вкладки каталога, комнаты, отделки, света и вида.
 * @module widgets/editor-panel/ui/EditorPanel
 */

import React, { useState } from 'react';
import cn from 'classnames';
import { Icon, type IconName } from '@/shared/ui/icon/Icon';
import { CatalogPanel } from './CatalogPanel';
import { FinishesPanel } from './FinishesPanel';
import { LightPanel } from './LightPanel';
import { RoomPanel } from './RoomPanel';
import { ViewPanel } from './ViewPanel';
import styles from './EditorPanel.module.scss';

type TabId = 'catalog' | 'room' | 'finishes' | 'light' | 'view';

const TABS: Array<{ id: TabId; label: string; icon: IconName; Panel: React.FC }> = [
  { id: 'catalog', label: 'Мебель', icon: 'sofa', Panel: CatalogPanel },
  { id: 'room', label: 'Комната', icon: 'wall', Panel: RoomPanel },
  { id: 'finishes', label: 'Отделка', icon: 'texture', Panel: FinishesPanel },
  { id: 'light', label: 'Свет', icon: 'sun', Panel: LightPanel },
  { id: 'view', label: 'Вид', icon: 'camera', Panel: ViewPanel },
];

export const EditorPanel: React.FC = () => {
  const [tab, setTab] = useState<TabId>('catalog');
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
      <div className={styles.content} role="tabpanel">
        <Active />
      </div>
    </aside>
  );
};
