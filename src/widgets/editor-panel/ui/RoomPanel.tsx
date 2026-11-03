/**
 * Комната: размеры, толщина стен, список стен (выбор, удаление/возврат, проёмы),
 * перегородки (добавить, выбрать, удалить) и инструменты проёмов.
 * @module widgets/editor-panel/ui/RoomPanel
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { WALL_THICKNESS_LIMITS } from '@/features/editor-3d/constants';
import { uniformThickness } from '@/features/editor-3d/lib/outerWalls';
import { SCENE_LIMITS } from '@/features/editor-3d/lib/scene/schema';
import { WALL_LABELS, WALL_SIDES } from '@/features/editor-3d/lib/walls';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { Button, FieldRow, IconButton, NumberField, Section } from '@/shared/ui/controls';
import styles from './EditorPanel.module.scss';

const WallsList: React.FC = () => {
  const commands = useSceneCommands();
  const openings = useSelector(editorSelectors.selectOpenings);
  const removed = useSelector(editorSelectors.selectRemovedWalls);
  const selection = useSelector(selectionSelectors.selectSelection);
  return (
    <div className={styles.list}>
      {WALL_SIDES.map((side) => {
        const isRemoved = removed.includes(side);
        const selected = selection?.kind === 'wall' && selection.side === side;
        return (
          <div key={side} className={cn(styles.listRow, selected && styles.listRowSelected)}>
            <button type="button" className={styles.listName} onClick={() => commands.select({ kind: 'wall', side })}>
              {WALL_LABELS[side]} <span className={styles.muted}>{isRemoved ? '· удалена' : `· проёмов: ${openings[side]?.length ?? 0}`}</span>
            </button>
            <IconButton icon="window" size="sm" label="Добавить окно" disabled={isRemoved} onClick={() => commands.openings.add(side, 'window')} />
            <IconButton icon="door" size="sm" label="Добавить дверь" disabled={isRemoved} onClick={() => commands.openings.add(side, 'door')} />
            <IconButton icon={isRemoved ? 'plus' : 'trash'} size="sm" label={isRemoved ? 'Вернуть стену' : 'Удалить стену'} onClick={() => commands.room.toggleWall(side)} />
          </div>
        );
      })}
    </div>
  );
};

const PartitionsList: React.FC = () => {
  const commands = useSceneCommands();
  const partitions = useSelector(editorSelectors.selectPartitions);
  const selection = useSelector(selectionSelectors.selectSelection);
  if (partitions.length === 0) return <span className={styles.muted}>Перегородок пока нет</span>;
  return (
    <div className={styles.list}>
      {partitions.map((p, i) => (
        <div key={p.id} className={cn(styles.listRow, selection?.kind === 'partition' && selection.id === p.id && styles.listRowSelected)}>
          <button type="button" className={styles.listName} onClick={() => commands.select({ kind: 'partition', id: p.id })}>
            Перегородка {i + 1} <span className={styles.muted}>· {Math.round(p.size[0] * 100)} см</span>
          </button>
          <IconButton icon="trash" size="sm" label="Удалить перегородку" onClick={() => commands.partitions.remove(p.id)} />
        </div>
      ))}
    </div>
  );
};

export const RoomPanel: React.FC = () => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const outerWalls = useSelector(editorSelectors.selectOuterWalls);
  const thickness = uniformThickness(outerWalls);
  const tool = useSelector(editorSelectors.selectActiveTool);

  return (
    <>
      <h2 className={styles.panelTitle}>Комната</h2>
      <Section title="Размеры">
        <FieldRow>
          <NumberField label="Ширина" unit="м" min={SCENE_LIMITS.width[0]} max={SCENE_LIMITS.width[1]} value={dims.width} onChange={(width) => commands.room.resize({ ...dims, width })} />
          <NumberField label="Глубина" unit="м" min={SCENE_LIMITS.depth[0]} max={SCENE_LIMITS.depth[1]} value={dims.depth} onChange={(depth) => commands.room.resize({ ...dims, depth })} />
        </FieldRow>
        <FieldRow>
          <NumberField label="Высота стен" unit="м" min={SCENE_LIMITS.height[0]} max={SCENE_LIMITS.height[1]} value={dims.height} onChange={(height) => commands.room.resize({ ...dims, height })} />
          <NumberField
            label={thickness === null ? 'Толщина стен (разная)' : 'Толщина стен'}
            unit="см"
            scale={100}
            precision={1}
            min={WALL_THICKNESS_LIMITS[0]}
            max={WALL_THICKNESS_LIMITS[1]}
            value={thickness ?? outerWalls.front.thickness}
            onChange={(t) => commands.room.setWallThickness(t)}
          />
        </FieldRow>
      </Section>
      <Section title="Стены">
        <WallsList />
      </Section>
      <Section
        title="Перегородки"
        action={
          <Button size="sm" icon="plus" variant={tool === 'partition' ? 'primary' : 'secondary'} onClick={() => dispatch(editorActions.setActiveTool(tool === 'partition' ? 'select' : 'partition'))}>
            {tool === 'partition' ? 'Кликните по полу' : 'Добавить'}
          </Button>
        }
      >
        <PartitionsList />
      </Section>
      <Section title="Проёмы">
        <div className={styles.actions}>
          <Button size="sm" icon="window" variant={tool === 'window' ? 'primary' : 'secondary'} onClick={() => dispatch(editorActions.setActiveTool(tool === 'window' ? 'select' : 'window'))}>
            Окно
          </Button>
          <Button size="sm" icon="door" variant={tool === 'door' ? 'primary' : 'secondary'} onClick={() => dispatch(editorActions.setActiveTool(tool === 'door' ? 'select' : 'door'))}>
            Дверь
          </Button>
        </div>
        <span className={styles.muted}>Выберите инструмент и кликните по стене или перегородке.</span>
      </Section>
    </>
  );
};
