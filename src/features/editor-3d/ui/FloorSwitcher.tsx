/**
 * Переключатель этажей: этажи сверху вниз (как кнопки лифта), активный выделен —
 * его редактируют 3D, 2D-план и инспектор. Можно добавить этаж сверху, переименовать
 * активный (двойной клик или карандаш) и удалить его — с подтверждением, отмена — Ctrl+Z.
 * @module editor-3d/ui/FloorSwitcher
 */

import React, { useState } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { buildingSelectors } from '../building/selectors';
import { FLOOR_NAME_LENGTH, MAX_FLOORS } from '../lib/building/floors';
import { useSceneCommands } from '../model/useSceneCommands';
import type { FloorMeta } from '../types';
import { IconButton } from '@/shared/ui/controls';
import { ConfirmDialog } from '@/shared/ui/overlay/Dialog';
import styles from './FloorSwitcher.module.scss';

/** Поле переименования этажа: Enter или уход фокуса — сохранить, Esc — отменить. */
const RenameField: React.FC<{ floor: FloorMeta; onDone: () => void }> = ({ floor, onDone }) => {
  const commands = useSceneCommands();
  const [value, setValue] = useState(floor.name);
  const commit = () => {
    commands.floors.rename(floor.id, value);
    onDone();
  };
  return (
    <input
      className={styles.input}
      value={value}
      maxLength={FLOOR_NAME_LENGTH}
      aria-label="Название этажа"
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
      }}
    />
  );
};

export const FloorSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const commands = useSceneCommands();
  const floors = useSelector(buildingSelectors.selectFloorMetas);
  const activeId = useSelector(buildingSelectors.selectActiveFloorId);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState<FloorMeta | null>(null);
  const active = floors.find((f) => f.id === activeId);
  const topDown = [...floors].reverse();

  return (
    <div className={cn(styles.switcher, className)}>
      <div className={styles.head}>
        <span className={styles.title}>Этажи</span>
        <IconButton
          icon="plus"
          size="sm"
          label={floors.length >= MAX_FLOORS ? `Не больше ${MAX_FLOORS} этажей` : 'Добавить этаж сверху'}
          disabled={floors.length >= MAX_FLOORS}
          onClick={() => commands.floors.add()}
        />
      </div>
      <div className={styles.list} role="radiogroup" aria-label="Этажи">
        {topDown.map((floor) =>
          floor.id === activeId && renaming ? (
            <RenameField key={floor.id} floor={floor} onDone={() => setRenaming(false)} />
          ) : (
            <button
              key={floor.id}
              type="button"
              role="radio"
              aria-checked={floor.id === activeId}
              className={cn(styles.floor, floor.id === activeId && styles.floorActive)}
              title={floor.id === activeId ? 'Активный этаж · двойной клик — переименовать' : 'Редактировать этот этаж'}
              onClick={() => commands.floors.activate(floor.id)}
              onDoubleClick={() => floor.id === activeId && setRenaming(true)}
            >
              {floor.name}
            </button>
          ),
        )}
      </div>
      {active && (
        <div className={styles.actions}>
          <IconButton icon="pencil" size="sm" label="Переименовать этаж" onClick={() => setRenaming(true)} />
          <IconButton icon="trash" size="sm" label="Удалить этаж" disabled={floors.length <= 1} onClick={() => setRemoving(active)} />
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title="Удалить этаж?"
          message={`«${removing.name}» удалится вместе со стенами, лестницами и мебелью этажа. Отменить можно через Ctrl+Z.`}
          confirmLabel="Удалить этаж"
          danger
          onConfirm={() => {
            commands.floors.remove(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
};
