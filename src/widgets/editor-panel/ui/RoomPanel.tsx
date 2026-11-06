/**
 * Комната (активный этаж): этаж (смещение, перекрытие, лестницы), размеры, толщина стен,
 * внешние стены (выбор, удаление/возврат, проёмы), внутренние стены (рисование, выбор,
 * удаление), помещения с площадями и инструменты проёмов.
 * @module widgets/editor-panel/ui/RoomPanel
 */

import React from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { WALL_THICKNESS_LIMITS } from '@/features/editor-3d/constants';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { SLAB_THICKNESS_LIMITS } from '@/features/editor-3d/lib/building/floors';
import { STAIR_KIND_LABELS } from '@/features/editor-3d/lib/stairs/stairs';
import { interaction } from '@/features/editor-3d/model/interactionStore';
import { selectRooms } from '@/features/editor-3d/layoutSelectors';
import { uniformThickness } from '@/features/editor-3d/lib/outerWalls';
import { partitionMaterial } from '@/features/editor-3d/lib/partitions';
import { ROOM_KINDS, totalArea } from '@/features/editor-3d/lib/roomLabels';
import { wallMaterial } from '@/features/editor-3d/lib/wallMaterials';
import { SCENE_LIMITS } from '@/features/editor-3d/lib/scene/schema';
import { WALL_LABELS, WALL_SIDES } from '@/features/editor-3d/lib/walls';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { formatArea } from '@/shared/lib/units';
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
  if (partitions.length === 0) return <span className={styles.muted}>Внутренних стен пока нет — нарисуйте их на полу</span>;
  return (
    <div className={styles.list}>
      {partitions.map((p, i) => (
        <div key={p.id} className={cn(styles.listRow, selection?.kind === 'partition' && selection.id === p.id && styles.listRowSelected)}>
          <button type="button" className={styles.listName} onClick={() => commands.select({ kind: 'partition', id: p.id })}>
            Стена {i + 1}{' '}
            <span className={styles.muted}>
              · {wallMaterial(partitionMaterial(p)).label.toLowerCase()}, {Math.round(p.size[2] * 100)} × {Math.round(p.size[0] * 100)} см
            </span>
          </button>
          <IconButton icon="trash" size="sm" label="Удалить стену" onClick={() => commands.partitions.remove(p.id)} />
        </div>
      ))}
    </div>
  );
};

const RoomsList: React.FC = () => {
  const commands = useSceneCommands();
  const rooms = useSelector(selectRooms);
  const selected = useSelector(selectionSelectors.selectSelectedRoom);
  return (
    <div className={styles.list}>
      {rooms.map((r) => (
        <div key={r.key} className={cn(styles.listRow, selected?.key === r.key && styles.listRowSelected)}>
          <button type="button" className={styles.listName} onClick={() => commands.select({ kind: 'room', point: [r.center[0], r.center[1]] })}>
            {r.name}{' '}
            <span className={styles.muted}>
              · {formatArea(r.area)}
              {r.kind !== 'room' ? ` · ${ROOM_KINDS[r.kind].label.toLowerCase()}` : ''}
            </span>
          </button>
        </div>
      ))}
      <span className={styles.muted}>Общая площадь: {formatArea(totalArea(rooms))} (лоджии ×0,5, балконы ×0,3)</span>
    </div>
  );
};

/** Активный этаж: смещение в здании, перекрытие и лестницы на этаж выше. */
const FloorSection: React.FC = () => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const floors = useSelector(buildingSelectors.selectFloorMetas);
  const index = useSelector(buildingSelectors.selectActiveIndex);
  const slab = useSelector(buildingSelectors.selectSlabThickness);
  const stairs = useSelector(editorSelectors.selectStairs);
  const selection = useSelector(selectionSelectors.selectSelection);
  const tool = useSelector(editorSelectors.selectActiveTool);
  const floor = floors[index];
  if (!floor) return null;
  const startStair = () => {
    interaction.chooseStair('straight');
    dispatch(editorActions.setActiveTool(tool === 'stair' ? 'select' : 'stair'));
  };
  return (
    <Section
      title={`Этаж: ${floor.name}`}
      action={
        <Button size="sm" icon="stairs" variant={tool === 'stair' ? 'primary' : 'secondary'} onClick={startStair}>
          {tool === 'stair' ? 'Готово' : 'Лестница'}
        </Button>
      }
    >
      {floors.length > 1 && (
        <FieldRow>
          <NumberField label="Сдвиг X" unit="м" precision={2} value={floor.offset[0]} onChange={(x) => commands.floors.setOffset(floor.id, [x, floor.offset[1]])} />
          <NumberField label="Сдвиг Z" unit="м" precision={2} value={floor.offset[1]} onChange={(z) => commands.floors.setOffset(floor.id, [floor.offset[0], z])} />
        </FieldRow>
      )}
      <NumberField
        label="Толщина перекрытия"
        unit="см"
        scale={100}
        precision={0}
        min={SLAB_THICKNESS_LIMITS[0]}
        max={SLAB_THICKNESS_LIMITS[1]}
        value={slab}
        onChange={(t) => commands.floors.setSlabThickness(t)}
      />
      {stairs.length > 0 ? (
        <div className={styles.list}>
          {stairs.map((s, i) => (
            <div key={s.id} className={cn(styles.listRow, selection?.kind === 'stair' && selection.id === s.id && styles.listRowSelected)}>
              <button type="button" className={styles.listName} onClick={() => commands.select({ kind: 'stair', id: s.id })}>
                {STAIR_KIND_LABELS[s.kind]} {stairs.length > 1 ? i + 1 : ''} <span className={styles.muted}>· {Math.round(s.width * 100)} см</span>
              </button>
              <IconButton icon="trash" size="sm" label="Удалить лестницу" onClick={() => commands.stairs.remove(s.id)} />
            </div>
          ))}
        </div>
      ) : (
        <span className={styles.muted}>Лестница на этаж выше ставится инструментом «Лестница» или из каталога.</span>
      )}
    </Section>
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
      <FloorSection />
      <Section title="Размеры">
        <FieldRow>
          <NumberField label="Ширина" unit="м" min={SCENE_LIMITS.width[0]} max={SCENE_LIMITS.width[1]} value={dims.width} onChange={(width) => commands.room.resize({ ...dims, width })} />
          <NumberField label="Глубина" unit="м" min={SCENE_LIMITS.depth[0]} max={SCENE_LIMITS.depth[1]} value={dims.depth} onChange={(depth) => commands.room.resize({ ...dims, depth })} />
        </FieldRow>
        <FieldRow>
          <NumberField label="Высота этажа" unit="м" min={SCENE_LIMITS.height[0]} max={SCENE_LIMITS.height[1]} value={dims.height} onChange={(height) => commands.room.resize({ ...dims, height })} />
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
        title="Внутренние стены"
        action={
          <Button size="sm" icon="plus" variant={tool === 'partition' ? 'primary' : 'secondary'} onClick={() => dispatch(editorActions.setActiveTool(tool === 'partition' ? 'select' : 'partition'))}>
            {tool === 'partition' ? 'Готово' : 'Нарисовать'}
          </Button>
        }
      >
        <PartitionsList />
      </Section>
      <Section title="Помещения">
        <RoomsList />
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
