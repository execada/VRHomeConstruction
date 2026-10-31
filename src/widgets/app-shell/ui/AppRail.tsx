/**
 * Левая сворачиваемая панель навигации (Figma): главная, шаблоны, настройки, импорт.
 * Свёрнутое состояние запоминается в localStorage.
 * @module widgets/app-shell/ui/AppRail
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import cn from 'classnames';
import { z } from 'zod';
import { useMediaQuery } from '@/shared/lib/useMediaQuery';
import { useStoredState } from '@/shared/lib/useStoredState';
import { Icon, type IconName } from '@/shared/ui/icon/Icon';
import styles from './appShell.module.scss';

const COLLAPSED_KEY = 'rail-collapsed';
const COMPACT_QUERY = '(width <= 640px)';

interface AppRailProps {
  onOpenSettings: () => void;
  onImport: () => void;
}

const RailLink: React.FC<{ to: string; icon: IconName; label: string }> = ({ to, icon, label }) => (
  <NavLink to={to} end className={({ isActive }) => cn(styles.railItem, isActive && styles.railItemActive)} title={label} aria-label={label}>
    <Icon name={icon} size={22} />
  </NavLink>
);

const RailButton: React.FC<{ icon: IconName; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button type="button" className={styles.railItem} onClick={onClick} title={label} aria-label={label}>
    <Icon name={icon} size={22} />
  </button>
);

export const AppRail: React.FC<AppRailProps> = ({ onOpenSettings, onImport }) => {
  const [collapsed, setCollapsed] = useStoredState(COLLAPSED_KEY, z.boolean(), false);
  // На телефоне панель внизу и сворачивание не применяется.
  const compact = useMediaQuery(COMPACT_QUERY);
  const toggle = () => setCollapsed(!collapsed);

  return (
    <nav className={cn(styles.rail, collapsed && styles.railCollapsed)} aria-label="Основная навигация">
      {(!collapsed || compact) && (
        <div className={styles.railGroup}>
          <RailLink to="/" icon="home" label="Мои проекты" />
          <RailLink to="/templates" icon="cube" label="Шаблоны" />
          <RailButton icon="gear" label="Настройки" onClick={onOpenSettings} />
        </div>
      )}
      <button
        type="button"
        className={styles.railToggle}
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
      </button>
      {(!collapsed || compact) && (
        <div className={styles.railGroup}>
          <RailButton icon="upload" label="Импорт проекта из файла" onClick={onImport} />
        </div>
      )}
    </nav>
  );
};
