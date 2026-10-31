/**
 * Заголовок инспектора: иконка, название и подзаголовок выделенного объекта.
 * @module widgets/editor-inspector/ui/InspectorHeader
 */

import React from 'react';
import { Icon, type IconName } from '@/shared/ui/icon/Icon';
import styles from './EditorInspector.module.scss';

interface InspectorHeaderProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const InspectorHeader: React.FC<InspectorHeaderProps> = ({ icon, title, subtitle, action }) => (
  <header className={styles.header}>
    <span className={styles.badge}>
      <Icon name={icon} size={18} />
    </span>
    <span className={styles.titles} style={{ flex: 1 }}>
      <span className={styles.title}>{title}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
    </span>
    {action}
  </header>
);

/** Строка «подпись — значение». */
export const Readout: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.readout}>
    <span>{label}</span>
    <span className={styles.readoutValue}>{value}</span>
  </div>
);
